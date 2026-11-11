"""Workspace public service interface: platform-neutral book catalogue and selection.

All business HTTP handlers receive exactly this capability, not internal paths
or writable state. Settings/CMD remain the sole commit gate under the caller's
shared write lock. macOS TCC/iCloud permissions belong to the host OS adapter,
not to this module; Linux uses the same POSIX directory permission checks.
"""
from dataclasses import dataclass
from pathlib import Path

from v6_workspace_roots import (
    allowed_roots, list_directories, list_books, saved_selection,
    selected_book, proposed_root, prepare_selected, convert_mineru_json,
)


@dataclass(frozen=True)
class ActiveBook:
    catalog: Path
    root: Path
    document: Path
    pdf: Path
    source_json: Path
    book: str


class WorkspaceService:
    """Public Workspace component; does not persist settings or mutate CMD."""

    def __init__(self, *, default_document, default_pdf, default_json,
                 settings_file, runtime, code_root, is_lab=False):
        self.default_document = Path(default_document)
        self.default_pdf = Path(default_pdf)
        self.default_json = Path(default_json)
        self.settings_file = Path(settings_file)
        self.runtime = Path(runtime)
        self.code_root = Path(code_root)
        self.is_lab = bool(is_lab)

    def roots(self):
        # Root discovery is an authorization catalogue, not a book validation.
        # Compute the trusted allowlist first. An outdated saved selection must
        # not prevent the user from browsing that allowlist to fix the choice.
        roots = [str(root) for root in allowed_roots(
            self.default_document, self.runtime, self.is_lab)]
        result = {
            'activeRoot': str(self.default_document.parent.resolve()),
            'configuredRoot': '', 'activeBook': '',
            'allowedRoots': roots, 'documentName': self.default_document.name,
        }
        try:
            configured, book, _ = saved_selection(
                self.settings_file, self.default_document, self.runtime, self.is_lab)
            active = self.active()
        except (OSError, ValueError, TypeError) as error:
            # Read-only recovery: do not change the saved settings or grant
            # access outside allowed_roots. Other book-dependent APIs keep
            # their existing strict validation behavior.
            result['selectionError'] = str(error)
            return result
        result.update({
            'activeRoot': str(active.root), 'configuredRoot': configured,
            'activeBook': book, 'documentName': active.document.name,
        })
        return result

    def browse(self, path):
        return list_directories(path, self.default_document, self.runtime, self.is_lab)

    def books(self, path):
        return list_books(path, self.default_document, self.runtime, self.is_lab)

    def active(self):
        selected = selected_book(self.settings_file, self.default_document,
                                 self.runtime, self.is_lab)
        if selected:
            folder, source, pdf, document = selected
            return ActiveBook(folder.parent, folder, document, pdf, source, folder.name)
        folder = self.default_document.parent.resolve()
        return ActiveBook(folder, folder, self.default_document, self.default_pdf,
                          self.default_json, '')

    def validate(self, settings_json):
        """Pure validation: no conversion and no writes."""
        return proposed_root(settings_json, self.default_document,
                             self.runtime, self.is_lab)

    def prepare(self, settings_json):
        """May create only the absent, validated book Markdown, never overwrite."""
        return prepare_selected(settings_json, self.default_document, self.runtime,
                                self.code_root, self.is_lab)

    def convert(self, source_json, timeout=20):
        """Reuse the same CMB conversion contract for uploads and book preparation."""
        return convert_mineru_json(source_json, self.code_root, timeout=timeout)
