from agent.version_utils import version_gte


def test_version_gte():
    assert version_gte("0.2.0", "0.1.0")
    assert version_gte("0.1.0", "0.1.0")
    assert not version_gte("0.0.9", "0.1.0")
