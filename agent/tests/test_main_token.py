"""Testes para extração de token do nome do executável."""
import pytest

from agent.token_from_name import extract_token_from_executable_name


@pytest.mark.parametrize(
    "argv0,expected",
    [
        (r"C:\Program Files\Olho Vivo\OlhoVivo_TOKEN_abc123.exe", "abc123"),
        ("./OlhoVivo_TOKEN_tok-9_x.EXE", "tok-9_x"),
        ("/opt/olhovivo-agent.exe", None),
        ("OlhoVivoSetup_TOKEN_uuid-here.exe", "uuid-here"),
    ],
)
def test_extract_token_from_executable_name(argv0: str, expected: str | None) -> None:
    assert extract_token_from_executable_name(argv0) == expected
