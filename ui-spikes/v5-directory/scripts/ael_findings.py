#!/usr/bin/env python3
"""Append-only, non-blocking, retrospective migration findings for V5 AEL.

Never rewrites the original AEL `changes` rows, never edits production modules,
and never changes whether AEL finish/check returns success. `review` only
records an observation; `seed` inserts missing retrospective records once.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT/'.runtime/ael.sqlite'
V4 = ROOT.parent/'v4-directory'

FINDINGS = (
    {
        'key': 'V5-MIG-UI-001', 'task_id': 7, 'owner': 'shell',
        'title': '纯迁移阶段未原样保留V4布局与样式（含构建时间标牌）',
        'expected': '迁移阶段保留V4的布局层次、尺寸、配色、交互及版本标牌语义；任何替换式设计必须作为独立适配任务记录。标牌包含可识别的日期和时分秒构建标识，与发布清单对应。',
        'observed': 'V5首次用单行49px顶栏及自定义样式代替V4多层顶栏，后经独立任务#7恢复三层，但版本标牌仍仅显示固定v5-wp2；纯迁移与后续适配曾混合。',
        'source_paths': ['ui-spikes/v4-directory/index.html','ui-spikes/v4-directory/assets/v4.css'],
        'target_paths': ['ui-spikes/v5-directory/index.html','ui-spikes/v5-directory/assets/v5-host.css','ui-spikes/v5-directory/app.js'],
        'correction': '对照冻结V4的顶栏/操作按钮/状态栏/工作区布局做实机截图与功能比较，另立Shell适配任务记录确有必要的差异；恢复具有日期、时分秒的V5构建标牌并与release-info一致。原任务#7原始记录保持不变。',
        'acceptance': 'Chromium+WebKit与实体iPad Safari视图/交互基准核对；V5标牌包含时分秒且与单一发布记录一致；用户确认视觉继承。',
        'detector': 'layout_build', 'evidence_kind': 'source_comparison_and_user_observation',
    },
    {
        'key': 'V5-MIG-SET-002', 'task_id': 2, 'owner': 'settings',
        'title': 'Settings迁移后参数名列被显示为中文（用户发现的显示偏差）',
        'expected': '参数名列必须保持V4验收后的原始字段和值的表达语义，不得在纯迁移任务中改名、翻译或替换显示值。',
        'observed': '用户报告V5参数名列显示被中文替换。V4/V5 settings.schema.json字节一致，共享Settings渲染器使用parameterName:e.label，schema本身有中文label。尚无证据证明是哪次V5适配引入或V4基准原样是否也是中文；不能记作已证实的schema改写。',
        'source_paths': ['ui-spikes/v4-directory/plugins/settings/settings.schema.json','ui-spikes/v4-directory/plugins/settings/settings.js'],
        'target_paths': ['ui-spikes/v5-directory/plugins/settings/settings.schema.json','ui-spikes/v5-directory/vendor/shared-settings/v1/releases/0.1.17/settings-panel.js'],
        'correction': '以相同schema和相同值对照V4冻结代码运行界面与V5，在AG Grid公开API中导出参数名列逐行值；定位显示字段id/label映射差异后，仅通过独立Settings适配任务修正，并保存对照证据。',
        'acceptance': '两版参数名列在相同数据下逐行一致，或差异经用户明确认可；记录UI测试及映射证据，不能仅凭schema哈希相同就判通过。',
        'detector': 'settings_display', 'evidence_kind': 'user_observation_attribution_unverified',
    },
    {
        'key': 'V5-MIG-SET-003', 'task_id': 2, 'owner': 'settings',
        'title': '章节定界尚未迁入，Settings已暴露章节定界配置',
        'expected': '纯迁移保持原件字节；但业务激活属于独立适配：仅向用户展示当前已迁入且可生效模块的配置，不得宣称未迁入章节模块的设置可用。',
        'observed': 'V5未注册plugins/chapter-boundary；Settings继承的完整schema含chapterAgColumnsLocked、chapterAgFontSize、chapterTitleFontScale三项章节设置，已进入可见设置界面。不是schema字节改动，而是模块激活过滤缺失。',
        'source_paths': ['ui-spikes/v4-directory/plugins/settings/settings.schema.json'],
        'target_paths': ['ui-spikes/v5-directory/plugins/settings/settings.schema.json','ui-spikes/v5-directory/plugins/registry.generated.js'],
        'correction': '保留V4完整原始schema作为证据；在独立Settings适配任务中由已注册插件manifest/配置所有者计算可见设置投影，章节定界未迁入时不呈现其配置；迁入后自动恢复。',
        'acceptance': '未迁入章节插件时，Settings AG不显示章节配置；迁入并激活时按同一契约显示；自动化覆盖正反场景。',
        'detector': 'unmigrated_settings', 'evidence_kind': 'verified_static_and_user_observation',
    },
)


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def tables(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS migration_findings (
        finding_key TEXT PRIMARY KEY,
        source_task_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        title TEXT NOT NULL,
        expected TEXT NOT NULL,
        observed TEXT NOT NULL,
        source_paths TEXT NOT NULL,
        target_paths TEXT NOT NULL,
        correction TEXT NOT NULL,
        acceptance TEXT NOT NULL,
        detector TEXT NOT NULL,
        evidence_kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution_evidence TEXT,
        FOREIGN KEY(source_task_id) REFERENCES changes(id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS migration_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        finding_key TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        check_outcome TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        FOREIGN KEY(finding_key) REFERENCES migration_findings(finding_key)
    )''')


def seed(conn):
    tables(conn)
    count=0
    for issue in FINDINGS:
        row=conn.execute('SELECT id FROM changes WHERE id=?',(issue['task_id'],)).fetchone()
        if row is None:raise RuntimeError(f"Original AEL task #{issue['task_id']} absent: refuse to invent history")
        columns=('finding_key','source_task_id','owner','title','expected','observed',
                 'source_paths','target_paths','correction','acceptance','detector','evidence_kind','created_at')
        vals=(issue['key'],issue['task_id'],issue['owner'],issue['title'],issue['expected'],issue['observed'],
              json.dumps(issue['source_paths'],ensure_ascii=False),json.dumps(issue['target_paths'],ensure_ascii=False),
              issue['correction'],issue['acceptance'],issue['detector'],issue['evidence_kind'],now())
        before=conn.total_changes
        conn.execute('INSERT OR IGNORE INTO migration_findings('+','.join(columns)+') VALUES ('+','.join('?' for _ in vals)+')',vals)
        count+=conn.total_changes-before
    return count


def proof(root:Path,kind:str):
    v4=root.parent/'v4-directory'
    if kind=='layout_build':
        source_html=(root/'index.html').read_bytes()
        original=(v4/'index.html').read_bytes()
        # Displayed build is stamped into the ONE published release, never
        # into an untracked V5 development-source template.
        published=root.parent.parent/'.runtime/ocr2md-public'
        release_file=published/'release-info.json'
        html_file=published/'index.html'
        if release_file.is_file() and html_file.is_file():
            html=html_file.read_text()
            release=json.loads(release_file.read_text())
        else:
            html=source_html.decode()
            release={}
        import re
        # V5 AppFrame owns the visible badge; the sole application-supplied
        # value is the exact buildId stamped into its host dataset on deploy.
        badge=re.search(r'id="app-host"[^>]*data-build-id="([^"]+)"',html)
        badge_value=badge.group(1) if badge else '(missing)'
        timestamped=bool(re.fullmatch(r'v5-\d{6}-\d{6}',badge_value))
        manifest_match=bool(release and release.get('buildId')==badge_value)
        source_app=(root/'app.js').read_text()
        published_app=(published/'app.js').read_text() if (published/'app.js').is_file() else ''
        code_has_shared_frame=('createAppFrame' in source_app and 'wcp:app-action' in source_app and
           (root/'vendor/wcp/components/v1/releases/0.1.8/app-frame.js').is_file())
        released_with_shared_frame=code_has_shared_frame and 'createAppFrame' in published_app
        fixed=bool(timestamped and manifest_match and released_with_shared_frame)
        outcome=('CODE_CORRECTED_VISUAL_REVIEW_PENDING' if fixed else
          'APP_FRAME_CANDIDATE_NOT_DEPLOYED' if code_has_shared_frame else 'DEVIATION_REQUIRES_REVIEW')
        return outcome, {
            'v4_html_sha256':hashlib.sha256(original).hexdigest(),
            'v5_source_html_sha256':hashlib.sha256(source_html).hexdigest(),
            'appframe_host_build_id':badge_value,
            'build_has_date_hour_minute_second':timestamped,
            'manifest_build_matches_badge':manifest_match,
            'v5_shared_app_frame_source_ready':code_has_shared_frame,
            'v5_shared_app_frame_released':released_with_shared_frame,
            'note':'Code restoration checked; frozen V4 comparative iPad visual acceptance remains for the user.',
        }
    if kind=='settings_display':
        original=(v4/'plugins/settings/settings.schema.json').read_bytes()
        current=(root/'plugins/settings/settings.schema.json').read_bytes()
        renderer=root/'vendor/shared-settings/v1/releases/0.1.17/settings-panel.js'
        adapter=(root/'plugins/settings/settings.js').read_text()
        panel=renderer.read_text() if renderer.exists() else ''
        scheme=json.loads(current)
        labels={x['id']:x['label'] for x in scheme if x.get('id') and x.get('label') and x['id']!=x['label']}
        has_id_projection=("panel.setParameterNameMode('id')" in adapter)
        outcome='DISPLAY_ID_PROJECTION_PRESENT_BROWSER_REVIEW_PENDING' if has_id_projection else 'RUNTIME_V4_V5_COMPARISON_REQUIRED'
        return outcome, {
            'schema_v4_v5_byte_equal':original==current,
            'shared_renderer_parameter_column_uses_label':'parameterName:e.label' in panel,
            'v5_adapter_displays_parameter_id':has_id_projection,
            'localized_label_examples':dict(list(labels.items())[:3]),
            'attribution':'User-reported migration difference; shared component stays untouched; Chromium/WebKit correction suite required.',
        }
    if kind=='unmigrated_settings':
        schema=json.loads((root/'plugins/settings/settings.schema.json').read_text())
        chapter=[x['id'] for x in schema if x.get('component')=='章节定界' or x.get('group')=='章节定界']
        plugin_exists=(root/'plugins/chapter-boundary/plugin.json').is_file()
        adapter=(root/'plugins/settings/settings.js').read_text()
        filtered=('panel.settingsSchema=visibleSchema' in adapter and
                  'const visibleSchema=runtimeSchema(schema)' in adapter and
                  "'章节定界':'ocr2md:chapter-boundary'" in adapter)
        if chapter and not plugin_exists and filtered:state='CODE_FILTERED_BROWSER_REVIEW_PENDING'
        elif chapter and not plugin_exists:state='UNMIGRATED_CONFIG_EXPOSED'
        elif chapter and plugin_exists:state='RUNTIME_VISIBILITY_RECHECK_REQUIRED'
        else:state='CONFIG_NOT_IN_SCHEMA_VERIFY_RUNTIME'
        return state,{'unmigrated_chapter_plugin':not plugin_exists,
                      'chapter_setting_count':len(chapter),'chapter_setting_ids':chapter,
                      'runtime_visibility_filter_present':filtered,
                      'note':'Schema preserved; verify zero chapter settings in AG/Source and latent values preserved in browser.'}
    raise ValueError('Unknown detector: '+kind)


def summaries(conn):
    try: rows=conn.execute("SELECT finding_key,title,source_task_id FROM migration_findings WHERE status='open' ORDER BY finding_key").fetchall()
    except sqlite3.OperationalError:return []
    return rows


def print_open_summary(conn):
    rows=summaries(conn)
    if rows:
        print('AEL_MIGRATION_FINDINGS_OPEN',len(rows),'ids='+','.join(r[0] for r in rows),
              'review=python3 scripts/ael.py review',flush=True)
    return rows


def review(conn,root:Path,record:bool=True):
    rows=conn.execute('''SELECT finding_key,source_task_id,owner,title,expected,observed,
            correction,acceptance,detector,evidence_kind,status
            FROM migration_findings ORDER BY finding_key''').fetchall()
    print('AEL_MIGRATION_REVIEW',len(rows),'record='+str(record).lower())
    for key,source,owner,title,expected,observed,correction,acceptance,detector,kind,status in rows:
        outcome,evidence=proof(root,detector)
        print(' FINDING',json.dumps({'id':key,'sourceTaskId':source,'owner':owner,'status':status,
            'title':title,'expected':expected,'observed':observed,'check':outcome,'evidence':evidence,
            'nextCorrection':correction,'acceptance':acceptance,'evidenceKind':kind},ensure_ascii=False))
        if record:
            conn.execute('INSERT INTO migration_reviews(finding_key,reviewed_at,check_outcome,evidence_json) VALUES (?,?,?,?)',
                         (key,now(),outcome,json.dumps(evidence,ensure_ascii=False,sort_keys=True)))
    print('AEL_MIGRATION_REVIEW_OPEN',len(summaries(conn)), 'advisory_only=true')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=('seed','review','summary'))
    p.add_argument('--db',type=Path,default=DB)
    p.add_argument('--root',type=Path,default=ROOT)
    args=p.parse_args()
    args.db.parent.mkdir(parents=True,exist_ok=True)
    with sqlite3.connect(args.db) as c:
        c.execute('PRAGMA foreign_keys=ON')
        if args.action=='seed':
            count=seed(c)
            print('AEL_MIGRATION_FINDINGS_SEEDED',count,'open='+str(len(summaries(c))))
        elif args.action=='review':review(c,args.root)
        else:print_open_summary(c)

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,sqlite3.Error,RuntimeError) as e:
        print('AEL_FINDINGS_ERROR',type(e).__name__,str(e),file=sys.stderr)
        sys.exit(2)
