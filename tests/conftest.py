import pytest
from playwright.sync_api import Page, BrowserContext

BASE_URL = "http://localhost:5173"

COACH_EMAIL = "coach@example.com"
COACH_PASSWORD = "123"

TRAINEE_EMAIL = "noammrks@gmail.com"
TRAINEE_PASSWORD = "123"


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


def login(page: Page, email: str, password: str) -> None:
    """Shared login helper."""
    page.goto(BASE_URL)
    page.get_by_test_id("login-email").fill(email)
    page.get_by_test_id("login-password").fill(password)
    page.get_by_test_id("login-btn").click()
