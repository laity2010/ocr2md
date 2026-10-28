"""Server-owned workspace root selection. Never expose unrestricted filesystem access.

Only already-authorized parent directories can be browsed or selected. A root
switch is a settings commit, not a migration of files or a new app instance.
"""
import json
import os
from pathlib import Path

KEY = 'workspace.files.rootPath'


def allowed_roots(default_doc, runtime, is_lab=False):
    doc_root = Path(default_doc).parent.resolve()
    roots = [doc_root]
    if not is_lab:
        roots.append((Path.home() / 'Documents').resolve())
    for raw in os.environ.get('V6_WORKSPACE_ALLOWED_ROOTS', '').split(os.pathsep):
        if raw.strip():
            candidate = Path(raw).expanduser().resolve()
            if is_lab and not candidate.is_relative_to(Path(runtime).resolve()):
                raise ValueError('Lab workspace root escapes isolated runtime')
            roots.append(candidate)
    return tuple(dict.fromkeys(path for path in roots if path.is_dir()))


def check_root(value, default_doc, runtime, is_lab=False, require_document=True):
    if value is None or value == '':
        return Path(default_doc).parent.resolve()
    if not isinstance(value, str) or len(value) > 1024 or '\x00' in value or '\n' in value:
        raise ValueError('Invalid workspace directory path')
    path = Path(value).expanduser()
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('Workspace path must be an absolute directory without ..')
    root = path.resolve(strict=True)
    if not root.is_dir() or not any(root.is_relative_to(allowed) for allowed in allowed_roots(default_doc, runtime, is_lab)):
        raise ValueError('Workspace directory is outside authorized roots')
    if not os.access(root, os.R_OK | os.X_OK | os.W_OK):
        raise ValueError('Workspace directory is not readable and writable')
    target = root / Path(default_doc).name
    if require_document and (not target.is_file() or target.is_symlink()):
        raise ValueError('Directory must contain an existing mother Markdown named ' + target.name)
    # Nothing in a newly selected root is created, copied or overwritten.
    for name in ('chapters', '.initialize-backups'):
        if (root / name).is_symlink():
            raise ValueError('Workspace subdirectory must not be a symbolic link: ' + name)
    return root


def saved_root(settings_file, default_doc, runtime, is_lab=False):
    path = Path(settings_file)
    if not path.is_file():
        return Path(default_doc).parent.resolve()
    data = json.loads(path.read_text(encoding='utf-8'))
    record = data.get('settings', {}).get(KEY, {})
    if not isinstance(record, dict):
        raise ValueError('Invalid workspace root record')
    value = record.get('value', '')
    return check_root(value, default_doc, runtime, is_lab)


def proposed_root(settings_json, default_doc, runtime, is_lab=False):
    data = json.loads(settings_json.decode('utf-8'))
    settings = data.get('settings', {})
    if not isinstance(settings, dict):
        raise ValueError('Invalid settings document')
    record = settings.get(KEY, {})
    if not isinstance(record, dict):
        raise ValueError('Invalid workspace root record')
    return check_root(record.get('value', ''), default_doc, runtime, is_lab)


def list_directories(value, default_doc, runtime, is_lab=False):
    root = check_root(value, default_doc, runtime, is_lab, require_document=False)
    children = []
    for entry in sorted(root.iterdir(), key=lambda item: item.name.casefold()):
        if len(children) >= 120:
            break
        if entry.name.startswith('.') or entry.is_symlink() or not entry.is_dir():
            continue
        try:
            if any(entry.resolve().is_relative_to(allowed) for allowed in allowed_roots(default_doc, runtime, is_lab)):
                children.append({'name': entry.name, 'path': str(entry)})
        except OSError:
            continue
    parent = root.parent
    if not any(parent.is_relative_to(allowed) for allowed in allowed_roots(default_doc, runtime, is_lab)):
        parent = None
    file = root / Path(default_doc).name
    return {'path': str(root), 'parent': str(parent) if parent else None,
            'children': children, 'hasDocument': file.is_file() and not file.is_symlink(),
            'documentName': file.name}
