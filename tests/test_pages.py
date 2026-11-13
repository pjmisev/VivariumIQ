import os

os.environ["DATABASE_URL"] = "sqlite://"

from fastapi.testclient import TestClient

import main


client = TestClient(main.app)


def test_landing_page_renders_without_bootstrap():
    response = client.get("/")
    assert response.status_code == 200
    body = response.text.lower()
    assert "vivariumiq" in body
    assert "daisyui" in body
    assert "bootstrap" not in body


def test_auth_pages_render_forms():
    login = client.get("/login")
    assert login.status_code == 200
    assert 'id="login-form"' in login.text
    assert "Welcome back" in login.text

    register = client.get("/register")
    assert register.status_code == 200
    assert 'id="register-form"' in register.text
    assert "Create your account" in register.text


def test_app_shell_pages_render():
    for path in ["/app", "/app/nodes", "/app/nodes/1", "/app/alerts", "/app/profile"]:
        response = client.get(path)
        assert response.status_code == 200, path
        assert "VivariumIQ" in response.text
        assert "bootstrap" not in response.text.lower()


def test_html_error_page_renders():
    response = client.get("/this-page-does-not-exist")
    assert response.status_code == 404
    assert "404" in response.text
    assert "Back to home" in response.text