"""Check the live Supabase wiring, end to end.

Run after applying supabase/intake.sql. With --write it inserts a real row so the
INSERT webhooks fire and both emails actually send, which is the only way to prove
the email side works. Without it, nothing is written.

    python3 test/live_check.py            # read-only checks
    python3 test/live_check.py --write     # also insert a real test submission
"""
import json, os, sys, urllib.request, urllib.error, pathlib, re

env = {}
p = pathlib.Path(__file__).resolve().parent.parent / ".env.local"
if p.exists():
    for line in p.read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m: env[m.group(1)] = m.group(2).strip().strip('"')
URL = env.get("VITE_SUPABASE_URL", "").rstrip("/")
KEY = env.get("VITE_SUPABASE_ANON_KEY", "")
# Service-role, local only. Lets the check read a test row back and delete it,
# which the public key deliberately cannot do.
SECRET = env.get("SUPABASE_SECRET_KEY", "")
TABLE = "intake_submissions"
ok = bad = 0

def check(good, msg, detail=""):
    global ok, bad
    if good: ok += 1; print("  ok  ", msg)
    else:    bad += 1; print("  FAIL", msg, ("\n         " + detail) if detail else "")

def call(method, path, body=None, admin=False, prefer="return=minimal"):
    k = SECRET if (admin and SECRET) else KEY
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": k, "Authorization": f"Bearer {k}",
                 "Content-Type": "application/json", "Prefer": prefer})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, str(e)

print("Credentials")
check(bool(URL and KEY), "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set")
if not (URL and KEY): sys.exit(1)
print(f"       project: {URL}")

print("\nTable")
status, body = call("GET", f"{TABLE}?select=id&limit=1")
exists = status == 200
check(exists, f"public.{TABLE} exists and the anon key can reach it",
      f"HTTP {status}: {body[:180]}\n         Apply supabase/intake.sql in the SQL editor.")

if exists:
    print("\nSecurity")
    # RLS with no SELECT policy returns 200 and an empty array, never other people's rows.
    check(body.strip() in ("[]", ""), "the anon key cannot read submissions back",
          f"it returned: {body[:160]}")

    print("\nConstraints")
    base = {"contact_name": "x", "organisation": "x", "industry": "Charity",
            "employee_count": "0-49", "main_location": "London", "roles": []}
    s, b = call("POST", TABLE, {**base, "contact_email": "not-an-email"})
    check(s >= 400 and "intake_email_shape" in b, "a malformed email is rejected by the database",
          f"HTTP {s}: {b[:160]}")
    s, b = call("POST", TABLE, {**base, "contact_email": "a@b.co", "roles": {"not": "an array"}})
    check(s >= 400, "a roles value that is not an array is rejected", f"HTTP {s}: {b[:160]}")

    if "--write" in sys.argv:
        print("\nReal insert (this fires the webhooks and sends both emails)")
        row = {
            "contact_name": "Intake Test", "contact_email": env.get("TEST_EMAIL", "millieharrison@twentysixconsulting.co.uk"),
            "contact_job_title": "Automated check", "organisation": "Zigbert internal test",
            "industry": "Charity", "employee_count": "0-49", "main_location": "London",
            "basis": "role", "entry_mode": "online",
            "notes": "Automated live check. Safe to delete.",
            "roles": [
                {"ref": "", "title": "Chief Executive", "salary": 95000,
                 "level": "Experts, Strategists & Leaders", "family": "Leadership", "comment": ""},
                {"ref": "", "title": "Grants Manager", "salary": 48000,
                 "level": "Mid to Senior", "family": "Programmes",
                 "comment": "Covers two funds since March."},
            ],
        }
        s, b = call("POST", TABLE, row)
        check(s in (200, 201, 204), f"a real submission inserts (HTTP {s})", b[:200])
        if s in (200, 201, 204) and SECRET:
            # Read it back with the service key to prove what actually landed, not
            # just that the POST was accepted.
            s2, b2 = call("GET", f"{TABLE}?select=*&organisation=eq.Zigbert%20internal%20test"
                                 "&order=created_at.desc&limit=1", admin=True)
            try:
                got = json.loads(b2)[0]
            except Exception:
                got = {}
            check(got.get("role_count") == 2, f"the row stored 2 roles (role_count={got.get('role_count')})")
            check(got.get("basis") == "role", "the row stored the basis")
            check((got.get("roles") or [{}])[1].get("comment") == "Covers two funds since March.",
                  "the row stored the per-role comment")
            check(got.get("employee_count") == "0-49", "the row stored the employee band")
        if s in (200, 201, 204):
            print("       Check both inboxes now:")
            print(f"         client confirmation -> {row['contact_email']}")
            print( "         consultant notice   -> millieharrison@twentysixconsulting.co.uk")
            if SECRET and "--keep" not in sys.argv:
                d, _ = call("DELETE", f"{TABLE}?organisation=eq.Zigbert%20internal%20test", admin=True)
                check(d in (200, 204), f"the test row was cleaned up afterwards (HTTP {d})")
            else:
                print("       Row left in place; it is labelled 'Zigbert internal test'.")
    else:
        print("\n(Run with --write to insert a real row and test both emails.)")

print(f"\n{ok} passed, {bad} failed")
sys.exit(1 if bad else 0)
