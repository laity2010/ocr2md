"""Main/Lab workspace catalogue and book isolation.

Root path is a *catalogue*. Its immediate child directories are books. Only a
selected and validated book becomes the mutable document workspace. No source
JSON/PDF is ever overwritten or moved, and no implied first-book selection.
"""
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

KEY = 'workspace.files.rootPath'
BOOK_KEY = 'workspace.files.bookName'
BOOK_MD_SUFFIX = '.minerujson.md'
MAX_JSON_BYTES = 8 * 1024 * 1024
MAX_MD_BYTES = 16 * 1024 * 1024


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


def check_root(value, default_doc, runtime, is_lab=False, require_document=False):
    if value is None or value == '':
        return Path(default_doc).parent.resolve()
    if not isinstance(value, str) or len(value) > 1024 or '\x00' in value or '\n' in value:
        raise ValueError('工作根目录不是有效路径')
    path = Path(value).expanduser()
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('工作根目录需要不含 .. 的绝对路径')
    try:
        root = path.resolve(strict=True)
    except FileNotFoundError as error:
        raise ValueError('目录不存在；请核对完整路径') from error
    except PermissionError as error:
        raise ValueError('服务器无权访问此目录') from error
    if not root.is_dir():
        raise ValueError('所填路径不是目录')
    if not any(root.is_relative_to(allowed) for allowed in allowed_roots(default_doc, runtime, is_lab)):
        raise ValueError('目录未授权；请从「浏览目录」中选择允许访问的目录')
    if not os.access(root, os.R_OK | os.X_OK | os.W_OK):
        raise ValueError('服务器无权读写此目录')
    if require_document and not (root / Path(default_doc).name).is_file():
        raise ValueError('目录没有旧版母 Markdown：' + Path(default_doc).name)
    return root


def _book_name(name):
    if (not isinstance(name, str) or not name or name in ('.', '..') or
        name.startswith('.') or len(name) > 180 or '/' in name or '\\' in name or
        '\x00' in name or '\n' in name):
        raise ValueError('书籍工作目录只能是工作根目录下的首层文件夹名称')
    return name


def book_paths(catalog, name):
    folder = catalog / _book_name(name)
    if folder.is_symlink() or not folder.is_dir() or folder.parent != catalog:
        raise ValueError('书籍工作目录不存在或是符号链接')
    paths = []
    for child, suffix in (('mineru json', '.json'), ('pdf', '.pdf')):
        directory = folder / child
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError('书籍缺少 ' + child + '/ 目录')
        matches = [p for p in directory.iterdir() if p.is_file() and not p.is_symlink() and
                   p.name.lower().endswith(suffix) and not p.name.startswith('.')]
        if len(matches) != 1:
            raise ValueError('书籍的 ' + child + '/ 需要且仅能有一个 ' + suffix + ' 来源文件')
        paths.append(matches[0])
    target = folder / (name + BOOK_MD_SUFFIX)
    if target.is_symlink():
        raise ValueError('母 Markdown 不允许是符号链接')
    return folder, paths[0], paths[1], target


def converted_is_valid(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > MAX_MD_BYTES:
        return False
    # The converter output supplies stable MinerU source/block anchors and
    # Markdown headings. Chapter-boundary annotations may be added later by CMD.
    data = path.read_text(encoding='utf-8')
    return (bool(re.search(r'(?m)^\s*<!-- minerujson:block:v1:\d+:\d+ -->\s*$', data))
            and '<!-- minerujson:source:v1' in data
            and bool(re.search(r'(?m)^#{1,6} +\S', data)))


def describe_book(catalog, name):
    try:
        folder, source, pdf, target = book_paths(catalog, name)
        exists = target.exists()
        ready = converted_is_valid(target) if exists else False
        state = 'ready' if ready else ('invalid-markdown' if exists else 'needs-conversion')
        return {'name':name, 'state':state, 'selectable':state in ('ready','needs-conversion'),
                'converted':ready,'sourceName':source.name,'pdfName':pdf.name,
                'markdownName':target.name,'chapterBoundaryReady':ready}
    except (OSError, ValueError, UnicodeDecodeError) as error:
        return {'name':name,'state':'invalid','selectable':False,'reason':str(error)}


def list_books(value, default_doc, runtime, is_lab=False):
    catalog = check_root(value, default_doc, runtime, is_lab)
    books = []
    for item in sorted(catalog.iterdir(), key=lambda p:p.name.casefold()):
        if len(books) >= 100:
            break
        if item.is_dir() and not item.is_symlink() and not item.name.startswith('.'):
            books.append(describe_book(catalog, item.name))
    return {'root':str(catalog),'books':books}


def _setting_values(payload):
    if not isinstance(payload, dict):
        raise ValueError('无效的工作区设置 JSON')
    settings = payload.get('settings', {})
    if not isinstance(settings, dict):
        raise ValueError('无效的工作区设置内容')
    def setting(key):
        entry = settings.get(key,{})
        if not isinstance(entry, dict):
            raise ValueError('无效的工作区设置记录')
        return entry.get('value','')
    return setting(KEY),setting(BOOK_KEY)


def saved_selection(settings_file, default_doc, runtime, is_lab=False):
    path=Path(settings_file)
    if not path.is_file():
        return '', '', Path(default_doc).parent.resolve()
    root_name, book_name = _setting_values(json.loads(path.read_text(encoding='utf-8')))
    catalog=check_root(root_name, default_doc, runtime, is_lab)
    if not book_name:
        return root_name, '', Path(default_doc).parent.resolve()
    if not root_name:
        raise ValueError('先设置工作根目录，再选择书籍')
    folder, _, _, target = book_paths(catalog, book_name)
    if not target.is_file():
        raise ValueError('已选书籍没有转换后的母 Markdown')
    return root_name, book_name, folder


def saved_root(settings_file, default_doc, runtime, is_lab=False):
    return saved_selection(settings_file,default_doc,runtime,is_lab)[2]


def proposed_root(settings_json, default_doc, runtime, is_lab=False):
    root_name, book_name = _setting_values(json.loads(settings_json.decode('utf-8')))
    catalog = check_root(root_name, default_doc, runtime, is_lab)
    if book_name:
        if not root_name:
            raise ValueError('先选择工作根目录，再选择书籍')
        book_paths(catalog,book_name)
    return catalog


def selected_book(settings_file, default_doc, runtime, is_lab=False):
    root_name, book_name, folder = saved_selection(settings_file,default_doc,runtime,is_lab)
    if not book_name:
        return None
    return book_paths(folder.parent, book_name)


def prepare_selected(settings_json, default_doc, runtime, code_root, is_lab=False):
    root_name, book_name = _setting_values(json.loads(settings_json.decode('utf-8')))
    catalog=proposed_root(settings_json, default_doc, runtime, is_lab)
    if not book_name:
        return None
    folder, json_path, _, target=book_paths(catalog,book_name)
    if target.exists():
        if not converted_is_valid(target):
            raise ValueError('已存在的母 Markdown 不符合 MinerU/章节定界基础格式，拒绝覆盖')
        return target
    if json_path.stat().st_size > MAX_JSON_BYTES:
        raise ValueError('MinerU JSON 体积超出转换限制')
    node='/opt/homebrew/bin/node'
    if not Path(node).is_file():
        raise ValueError('MinerU 转换器运行环境不可用')
    program=("import {toMarkdown} from './packages/minerujson-md/dist/index.js';"
             "const chunks=[];for await(const c of process.stdin)chunks.push(c);"
             "process.stdout.write(toMarkdown(Buffer.concat(chunks).toString('utf8')));")
    try:
        output=subprocess.run([node,'--input-type=module','-e',program],
               input=json_path.read_bytes(),cwd=code_root,capture_output=True,timeout=25)
    except (OSError,subprocess.TimeoutExpired) as error:
        raise ValueError('MinerU JSON 转换超时或失败') from error
    if output.returncode or not output.stdout or len(output.stdout)>MAX_MD_BYTES:
        raise ValueError('MinerU JSON 不符合转换器要求或转换结果超出限制')
    tmp_file=None
    try:
        with tempfile.NamedTemporaryFile(dir=folder,prefix='.mineru-stage-',suffix='.md',delete=False) as tmp:
            tmp_file=Path(tmp.name)
            tmp.write(output.stdout)
        if not converted_is_valid(tmp_file):
            raise ValueError('生成的 Markdown 不符合 MinerU 锚点和章节标题要求')
        # Never overwrite an existing Markdown, including concurrent external edits.
        os.link(tmp_file,target)
    except FileExistsError as error:
        raise ValueError('母 Markdown 已由其他操作创建，请重新核对') from error
    finally:
        if tmp_file is not None:
            tmp_file.unlink(missing_ok=True)
    return target


def list_directories(value, default_doc, runtime, is_lab=False):
    root = check_root(value, default_doc, runtime, is_lab)
    children=[]
    for entry in sorted(root.iterdir(), key=lambda item:item.name.casefold()):
        if len(children)>=120:break
        if entry.name.startswith('.') or entry.is_symlink() or not entry.is_dir():continue
        try:
            if any(entry.resolve().is_relative_to(allowed) for allowed in allowed_roots(default_doc,runtime,is_lab)):
                children.append({'name':entry.name,'path':str(entry)})
        except OSError:continue
    parent=root.parent
    if not any(parent.is_relative_to(allowed) for allowed in allowed_roots(default_doc,runtime,is_lab)):
        parent=None
    return {'path':str(root),'parent':str(parent) if parent else None,
      'children':children, 'books':list_books(str(root),default_doc,runtime,is_lab)['books'],
      'documentName':Path(default_doc).name}
