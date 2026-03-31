"""
IronTrack E2E test suite.

Tests:
1. Coach login → lands on client list
2. Coach adds a column in Admin panel
3. Trainee login → logs a set in WorkoutGridLogger
"""

import re
import pytest
from playwright.sync_api import Page, expect

from conftest import login, COACH_EMAIL, COACH_PASSWORD, TRAINEE_EMAIL, TRAINEE_PASSWORD


# ─── 1. Login ────────────────────────────────────────────────────────────────

class TestLogin:
    def test_coach_login_shows_client_list(self, page: Page) -> None:
        """Logging in as coach should show the Clients heading."""
        login(page, COACH_EMAIL, COACH_PASSWORD)
        expect(page.locator("h1")).to_contain_text("Clients")

    def test_trainee_login_shows_dashboard(self, page: Page) -> None:
        """Logging in as trainee should show the athlete dashboard with their name."""
        login(page, TRAINEE_EMAIL, TRAINEE_PASSWORD)
        expect(page.locator("h1")).to_contain_text("Noam Marks")

    def test_invalid_login_shows_error(self, page: Page) -> None:
        """Wrong credentials must surface an error message, not navigate away."""
        login(page, "nobody@example.com", "wrong")
        expect(page.get_by_test_id("login-btn")).to_be_visible()
        expect(page.locator("text=Invalid")).to_be_visible()


# ─── 2. Admin: add a column ───────────────────────────────────────────────────

class TestAdminColumnManagement:
    def test_add_plan_column(self, page: Page) -> None:
        """Coach can add a new Plan column and it appears in the header."""
        login(page, COACH_EMAIL, COACH_PASSWORD)

        # Navigate to a client
        page.locator("[data-testid]").first.click()  # click first client card

        # Open admin panel
        page.get_by_test_id("admin-btn").click()
        expect(page.locator("h1")).to_contain_text("Admin Panel")

        # Open add-column modal
        page.get_by_test_id("add-column-btn").click()

        # Fill in the column label
        page.get_by_test_id("column-label-input").fill("Tempo")

        # Choose 'plan' type (already default, but be explicit)
        page.locator("button", has_text="Plan (Coach Sets)").click()

        # Save
        page.get_by_test_id("save-column-btn").click()

        # The modal should close and "Tempo" should appear in the column headers
        expect(page.locator("text=TEMPO").or_(page.locator("text=Tempo"))).to_be_visible()

    def test_add_actual_column(self, page: Page) -> None:
        """Coach can add a new Actual column (trainee input)."""
        login(page, COACH_EMAIL, COACH_PASSWORD)

        page.locator("[data-testid]").first.click()
        page.get_by_test_id("admin-btn").click()
        page.get_by_test_id("add-column-btn").click()

        page.get_by_test_id("column-label-input").fill("Rest (s)")
        page.locator("button", has_text="Actual (Trainee Logs)").click()
        page.get_by_test_id("save-column-btn").click()

        expect(
            page.locator("text=REST (S)").or_(page.locator("text=Rest (s)"))
        ).to_be_visible()


# ─── 3. Trainee: log a set ────────────────────────────────────────────────────

class TestWorkoutLogging:
    def test_trainee_can_log_actual_load(self, page: Page) -> None:
        """Trainee navigates to day 1, enters actual load for the first exercise, saves."""
        login(page, TRAINEE_EMAIL, TRAINEE_PASSWORD)

        # The trainee dashboard should be visible — click Week 1
        page.get_by_test_id("week-tab-1").click()

        # Click 'Log Session' for Day 1
        page.get_by_test_id("log-session-btn-day-1").click()

        # The grid logger should be visible
        expect(page.locator("h1")).to_contain_text("Log Session")

        # Find the first actual-load input and fill it in
        # The first exercise row has data-testid="exercise-row-0"
        # The actual load input: data-testid="input-{exId}-actualLoad"
        # We use a broader selector since the exact exerciseId is dynamic
        first_actual_input = page.locator("[data-testid^='input-'][data-testid$='-actualLoad']").first
        first_actual_input.fill("120")

        # Save the session
        page.get_by_test_id("save-session-btn").click()

        # After save we should be back at the dashboard
        expect(page.locator("h1")).to_contain_text("Noam Marks")

    def test_trainee_can_log_actual_rpe(self, page: Page) -> None:
        """Trainee logs both actual load and actual RPE for the first exercise."""
        login(page, TRAINEE_EMAIL, TRAINEE_PASSWORD)
        page.get_by_test_id("week-tab-1").click()
        page.get_by_test_id("log-session-btn-day-1").click()

        page.locator("[data-testid^='input-'][data-testid$='-actualLoad']").first.fill("115")
        page.locator("[data-testid^='input-'][data-testid$='-actualRpe']").first.fill("8")

        page.get_by_test_id("save-session-btn").click()
        expect(page.locator("h1")).to_contain_text("Noam Marks")

    def test_save_session_returns_to_dashboard(self, page: Page) -> None:
        """Pressing Save Session without entering any data still navigates back."""
        login(page, TRAINEE_EMAIL, TRAINEE_PASSWORD)
        page.get_by_test_id("week-tab-1").click()
        page.get_by_test_id("log-session-btn-day-1").click()
        page.get_by_test_id("save-session-btn").click()
        expect(page.locator("h1")).to_contain_text("Noam Marks")
