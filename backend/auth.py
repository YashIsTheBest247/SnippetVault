"""JWT authentication helpers.

Tokens are signed with HS256 using a secret read from the SNIPPET_SECRET
environment variable (a dev default is used if unset — override it in any real
deployment). PyJWT is pure-Python, so this adds no compiled dependencies.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

import db

SECRET = os.environ.get("SNIPPET_SECRET", "dev-only-insecure-secret-change-me")
ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 24 * 7  # one week

# tokenUrl is only metadata for the OpenAPI "Authorize" button; the dependency
# itself just pulls the Bearer token out of the Authorization header.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def create_token(user_id: int, username: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Decode the bearer token and return the matching user row as a dict.

    Raises 401 for a missing/expired/forged token, or if the user no longer
    exists (e.g. token issued before the account was deleted).
    """
    creds_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise creds_error

    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT id, username FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if row is None:
        raise creds_error
    return {"id": row["id"], "username": row["username"]}
