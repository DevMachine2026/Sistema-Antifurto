"""Comparação semver simples (major.minor.patch)."""

def version_gte(current: str, minimum: str) -> bool:
    def parts(v: str) -> list[int]:
        return [int(x) if x.isdigit() else 0 for x in v.strip().split(".")[:3]]

    a, b = parts(current), parts(minimum)
    for i in range(3):
        if a[i] > b[i]:
            return True
        if a[i] < b[i]:
            return False
    return True
