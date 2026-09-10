"""Drives the built form in a real browser, both routes through step 3.

The Supabase insert is intercepted, so running the tests never writes real rows.
What it asserts is the PAYLOAD: the shape that reaches the database is the thing
the confirmation email and the dashboard build both depend on.
"""
import json, sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:4200/zigbert-intake/"
passed = failed = 0

def check(ok, msg):
    global passed, failed
    if ok: passed += 1; print("  ok  ", msg)
    else:  failed += 1; print("  FAIL", msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(accept_downloads=True, viewport={"width": 1200, "height": 950})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))

    captured = {}
    def intercept(route):
        try: captured["body"] = json.loads(route.request.post_data or "null")
        except Exception: captured["body"] = None
        route.fulfill(status=201, content_type="application/json", body="[]")
    pg.route("**/rest/v1/intake_submissions*", intercept)

    pg.goto(URL, wait_until="networkidle")

    print("Step 1 — validation")
    pg.click("text=Continue")
    check(pg.locator("text=Please tell us who to reply to.").count() == 1, "blocks an empty name")
    check(pg.locator("text=We need an email").count() == 1, "blocks an empty email")
    pg.fill('input[autocomplete="name"]', "Dana Whitfield")
    pg.fill('input[type="email"]', "not-an-email")
    pg.click("text=Continue")
    check(pg.locator("text=does not look like an email").count() == 1, "rejects a malformed email")
    pg.fill('input[type="email"]', "dana@hollowoak.example")
    pg.click("text=Continue")
    check(pg.locator("h1:has-text('Your organisation')").count() == 1, "advances to step 2")

    print("\nStep 2 — organisation")
    pg.click("text=Continue")
    check(pg.locator("text=Please give the organisation").count() == 1, "requires the organisation name")
    pg.fill('input[autocomplete="organization"]', "Hollow Oak Trust")
    pg.click("text=Continue")
    # Industry, size and location define the comparator group, so all three are required.
    check(pg.locator("text=right comparator group").count() == 1, "requires the industry")
    check(pg.locator("text=choose a size band").count() == 1, "requires the employee band")
    check(pg.locator("[role=alert]:has-text('where most of your people')").count() == 1, "requires the location")
    pg.fill('input:below(:text("Sector or industry"))' , "Charity")
    pg.select_option("select >> nth=0", "0-49")
    pg.select_option("select >> nth=1", "London")
    pg.click("text=Continue")
    check(pg.locator("h1:has-text('Your roles')").count() == 1, "advances to step 3")

    print("\nStep 3 — typing roles in")
    check(pg.locator("text=Type them in here").count() == 1, "offers the type-in route")
    check(pg.locator("text=Use our spreadsheet").count() == 1, "offers the spreadsheet route")
    pg.click("text=Type them in here")
    check(pg.locator("button:has-text('One row per role')").count() == 1, "offers a per-role basis")
    check(pg.locator("button:has-text('One row per person')").count() == 1, "offers a per-person basis")
    check(pg.locator("text=Your job levels may look like this").count() == 1, "shows the job level guide")
    check(pg.locator('input[placeholder="Employee ID (optional)"]').count() == 0,
          "no employee reference on the role basis")
    pg.fill('input[placeholder="Role title"]', "Chief Executive")
    pg.fill('input[placeholder="Current FTE salary (£)"]', "95000")
    pg.click("text=Add another role")
    check(pg.locator('input[placeholder="Role title"]').count() == 2, "adds a second role row")
    pg.locator('input[placeholder="Role title"]').nth(1).fill("Grants Manager")
    pg.locator('input[placeholder^="Comment (optional)"]').nth(0).fill("Covers two funds.")
    check(pg.locator("text=/\\d+ roles? ready/").inner_text().startswith("2"), "counts the roles ready")
    pg.click("text=Send to Zigbert")
    pg.wait_for_timeout(1200)
    body = captured.get("body") or {}
    check(pg.locator("h1:has-text('Thank you')").count() == 1, "reaches the thank-you page")
    check(pg.locator("text=confirmation is on its way").count() == 0,
          "does not promise a confirmation email we do not send")
    check(len(body.get("roles", [])) == 2, f"sends both roles ({len(body.get('roles', []))})")
    check(body.get("entry_mode") == "online", "records entry_mode = online")
    check(body.get("contact_email") == "dana@hollowoak.example", "sends the contact email")
    check(body.get("organisation") == "Hollow Oak Trust", "sends the organisation")
    check(body.get("roles", [{}])[0].get("salary") == 95000, "sends the salary as a number, not a string")
    check(body.get("main_location") == "London", "sends the location")
    check(body.get("employee_count") == "0-49", "sends the employee band, not a raw number")
    check(body.get("industry") == "Charity", "sends the industry")
    check(body.get("basis") == "role", "records basis = role")
    check(body.get("roles", [{}])[0].get("comment") == "Covers two funds.", "sends the comment")
    check("contact_phone" not in body, "no phone number is collected")

    print("\nStep 3 — one row per person")
    captured.clear()
    pg.goto(URL, wait_until="networkidle")
    pg.fill('input[autocomplete="name"]', "Sam Reed")
    pg.fill('input[type="email"]', "sam@hollowoak.example")
    pg.click("text=Continue")
    pg.fill('input[autocomplete="organization"]', "Hollow Oak Trust")
    pg.fill('input:below(:text("Sector or industry"))', "Charity")
    pg.select_option("select >> nth=0", "50-99")
    pg.select_option("select >> nth=1", "Scotland")
    pg.click("text=Continue")
    pg.click("text=Type them in here")
    pg.click("button:has-text('One row per person')")
    check(pg.locator('input[placeholder="Employee ID (optional)"]').count() == 1,
          "the employee reference appears on the person basis")
    pg.fill('input[placeholder="Employee ID (optional)"]', "EMP-001")
    pg.fill('input[placeholder="Role title, e.g. Data Analyst 1"]', "Data Analyst 1")
    pg.fill('input[placeholder="Current FTE salary (£)"]', "41000")
    pg.click("text=Send to Zigbert")
    pg.wait_for_timeout(1200)
    body = captured.get("body") or {}
    check(body.get("basis") == "person", "records basis = person")
    check(body.get("roles", [{}])[0].get("ref") == "EMP-001", "sends the employee reference")
    check(body.get("roles", [{}])[0].get("title") == "Data Analyst 1", "sends the anonymised title")

    print("\nStep 3 — the spreadsheet route")
    captured.clear()
    pg.goto(URL, wait_until="networkidle")
    pg.fill('input[autocomplete="name"]', "Sam Reed")
    pg.fill('input[type="email"]', "sam@hollowoak.example")
    pg.click("text=Continue")
    pg.fill('input[autocomplete="organization"]', "Hollow Oak Trust")
    pg.fill('input:below(:text("Sector or industry"))', "Charity")
    pg.select_option("select >> nth=0", "0-49")
    pg.select_option("select >> nth=1", "London")
    pg.click("text=Continue")
    pg.click("text=Use our spreadsheet")
    check(pg.locator("text=Already have this in a spreadsheet of your own").count() == 1,
          "invites them to send a spreadsheet they already have")
    with pg.expect_download() as dl:
        pg.click("text=Zigbert-Benchmarking-Template.xlsx")
    check(dl.value.suggested_filename.endswith(".xlsx"),
          f"the template downloads ({dl.value.suggested_filename})")
    pg.set_input_files('input[type="file"]', "/tmp/filled.xlsx")
    pg.wait_for_timeout(2500)
    check(pg.locator("text=5 roles").count() >= 1, "reads 5 roles out of the upload")
    check(pg.locator("text=/1 of 5 roles have no salary/").count() == 1, "surfaces the missing-salary warning")
    check(pg.locator("table tbody tr").count() == 5, "previews every role before sending")
    pg.click("text=Send to Zigbert")
    pg.wait_for_timeout(1200)
    body = captured.get("body") or {}
    check(len(body.get("roles", [])) == 5, f"sends all 5 parsed roles ({len(body.get('roles', []))})")
    check(body.get("entry_mode") == "upload", "records entry_mode = upload")
    check(body.get("uploaded_filename") == "filled.xlsx", "records the uploaded filename")
    # The template carries the organisation details, so they should not be retyped.
    check(body.get("basis") == "role", "records the basis the file came off")

    print("\nNo console errors:", errs[:2] or "none")
    if errs: failed += 1
    b.close()

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
