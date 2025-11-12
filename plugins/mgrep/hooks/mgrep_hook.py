# plugins/mgrep/hooks/mgrep_hook.py
from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Sequence

def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default

def _env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default

DEBUG_LOG_FILE = Path(os.environ.get("MGREP_HOOK_LOG", "/tmp/mgrep-hook.log"))
TOKEN_FILE = Path.home() / ".mgrep" / "token.json"
DEFAULT_MAX_RESULTS = _env_int("MGREP_HOOK_MAX_RESULTS", 20)
DEFAULT_TIMEOUT = _env_float("MGREP_HOOK_CMD_TIMEOUT", 25.0)
PATH_TOKEN = re.compile(r"^(?P<path>.+?)(?=:\d)")

def debug_log(message: str) -> None:
    try:
        DEBUG_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(DEBUG_LOG_FILE, "a", encoding="utf-8") as handle:
            handle.write(f"[{stamp}] {message}\n")
    except Exception:
        pass

def read_hook_input() -> dict[str, object] | None:
    raw = sys.stdin.read()
    if not raw.strip():
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        debug_log(f"Failed to decode JSON: {exc}")
        return None

def normalize_globs(value: object) -> list[str]:
    if isinstance(value, str):
        pattern = value.strip()
        return [pattern] if pattern else []
    if isinstance(value, Iterable):
        patterns: list[str] = []
        for entry in value:
            if isinstance(entry, str):
                entry = entry.strip()
                if entry:
                    patterns.append(entry)
        return patterns
    return []

def resolve_workspace(payload: dict[str, object]) -> Path:
    cwd_value = payload.get("cwd")
    if isinstance(cwd_value, str) and cwd_value.strip():
        cwd_path = Path(cwd_value).expanduser()
        if cwd_path.exists():
            return cwd_path.resolve()
    return Path.cwd().resolve()

def resolve_scope_path(tool_input: dict[str, object], workspace: Path) -> Path:
    raw_path = tool_input.get("path")
    if isinstance(raw_path, str) and raw_path.strip():
        candidate = Path(raw_path).expanduser()
        if not candidate.is_absolute():
            candidate = (workspace / candidate).resolve()
        return candidate
    return workspace

def describe_scope(scope: Path, workspace: Path) -> str:
    try:
        rel = scope.relative_to(workspace)
        rel_text = rel.as_posix()
        return rel_text or "."
    except ValueError:
        return scope.as_posix()

def compute_cli_path_arg(scope: Path, workspace: Path) -> str | None:
    try:
        rel = scope.relative_to(workspace)
        rel_text = rel.as_posix()
        return None if not rel_text or rel_text == "." else rel_text
    except ValueError:
        return scope.as_posix()

def resolve_mgrep_command() -> Sequence[str] | None:
    override = os.environ.get("MGREP_BIN")
    if override:
        return shlex.split(override)

    binary = shutil.which("mgrep")
    if binary:
        return [binary]

    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if plugin_root:
        plugin_path = Path(plugin_root).resolve()
        repo_root = plugin_path.parent.parent
        candidate = repo_root / "dist" / "index.js"
        if candidate.exists():
            return ["node", candidate.as_posix()]
    return None

def extract_paths(line: str, workspace: Path) -> tuple[str | None, str | None, str | None]:
    match = PATH_TOKEN.search(line)
    raw_path = match.group("path") if match else None
    if not raw_path:
        colon_idx = line.find(":")
        if colon_idx != -1:
            raw_path = line[:colon_idx]
    if not raw_path:
        return (None, None, None)

    cleaned = raw_path.strip()
    if cleaned.startswith("./"):
        rel = cleaned[2:] or "."
    elif cleaned.startswith("."):
        rel = cleaned[1:] or "."
    else:
        rel = cleaned

    if os.path.isabs(rel) or re.match(r"^[A-Za-z]:", rel):
        abs_path = Path(rel)
    else:
        abs_path = (workspace / rel).resolve()

    try:
        rel_path = abs_path.relative_to(workspace).as_posix()
    except ValueError:
        rel_path = abs_path.as_posix()

    display_path = cleaned if cleaned.startswith(".") else rel_path
    return display_path, rel_path, abs_path.as_posix()

def build_payload(
    lines: list[str],
    pattern: str,
    scope_label: str,
    output_mode: str,
    workspace: Path,
) -> str:
    header = f"MGrep semantic search for {pattern!r} in {scope_label}"
    if output_mode == "paths":
        seen: list[str] = []
        for line in lines:
            display_path, rel_path, abs_path = extract_paths(line, workspace)
            value = display_path or rel_path or abs_path or line
            if value not in seen:
                seen.append(value)
        body = "\n".join(seen)
    else:
        body = "\n".join(lines)
    return f"{header}\n{body}"

def run_mgrep(command: Sequence[str], cwd: Path) -> str | None:
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=DEFAULT_TIMEOUT,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        debug_log(f"mgrep execution failed: {exc}")
        return None

    if result.returncode != 0:
        debug_log(f"mgrep exited with {result.returncode}: {result.stderr.strip()}")
        return None

    return result.stdout

def is_disabled() -> bool:
    value = os.environ.get("MGREP_HOOK_DISABLE")
    return bool(value and value.lower() in {"1", "true", "yes", "on"})

def should_use_mgrep_for_glob(glob_patterns: list[str], scope: Path, workspace: Path, store: str) -> bool:
    """
    Placeholder: Check if files matching glob patterns are indexed.
    Returns True to use mgrep, False to allow grep.
    """
    if not glob_patterns:
        return True
    # TODO: Check if files matching glob are indexed
    debug_log("Placeholder: should_use_mgrep_for_glob - allowing grep for now")
    return False

def main() -> int:
    payload = read_hook_input()
    if not payload or payload.get("tool_name") != "Grep":
        return 0

    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return 0

    pattern = tool_input.get("pattern")
    if not isinstance(pattern, str) or not pattern.strip():
        return 0

    if is_disabled() or not TOKEN_FILE.exists():
        return 0

    command_prefix = resolve_mgrep_command()
    if not command_prefix:
        return 0

    workspace = resolve_workspace(payload)
    scope = resolve_scope_path(tool_input, workspace)
    path_arg = compute_cli_path_arg(scope, workspace)

    glob_patterns = normalize_globs(tool_input.get("glob"))
    if glob_patterns:
        if not should_use_mgrep_for_glob(glob_patterns, scope, workspace, os.environ.get("MGREP_STORE", "mgrep")):
            return 0

    output_mode = tool_input.get("output_mode", "content")
    if output_mode not in {"content", "paths"}:
        output_mode = "content"

    command = [*command_prefix, "search", pattern]
    if path_arg:
        command.append(path_arg)

    stdout = run_mgrep(command, workspace)
    if stdout is None:
        return 0

    lines = [line for line in stdout.splitlines() if line.strip()]
    if not lines:
        return 0

    scope_label = describe_scope(scope, workspace)
    payload_text = build_payload(lines, pattern, scope_label, output_mode, workspace)

    response = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",  # Block the original Grep tool
            "permissionDecisionReason": "Semantic search completed by mgrep: " + payload_text,
        }
    }

    print(json.dumps(response))
    return 0

if __name__ == "__main__":
    sys.exit(main())
