# OCR2MD 交叉互译输出格式

每章固定在：

```text
chapters/章节名称/trans/
├── 章节名称.md
├── .ocr2md-translations.json
├── org2trans 章节名称.md
├── trans2org 章节名称.md
└── trans 章节名称.md
```

`org2trans` 以原文为主，链接译文；`trans2org` 以译文为主，反向链接原文。两边结构镜像。

`trans 章节名称.md` 是纯译文版：只保留译文正文和原有 Markdown 结构，不生成 `sid`、交叉互译 callout 或跨文件锚点链接。图片、HTML、脚注编号、URL、wikilink、代码和公式等非翻译结构继续原样保留。

三份输出文件在一次导出中作为同一组写入：全部成功才完成替换，任一失败则回滚已有版本。

## 1. 纯译文版

文件名：

```text
trans 章节名称.md
```

规则：

- 只输出译文，不包含原文。
- 不生成 `^sid-*` / `^bid-*`。
- 不生成交叉互译 `ds` callout。
- 不生成指向 `org2trans` / `trans2org` 的锚点链接。
- 普通段落将逐句译文重新组成原段落。
- 标题保留原 Markdown 标题层级。
- 编号 / 项目符号段落保留首个列表标记，并将逐句译文重新组成一个列表段落。
- 注释正文按注释规则合并成一个 `[^n]: ...` 文本块。
- 合成块只保留译文侧文字与原有图片、HTML、`<embed>` 等结构，不保留原文侧内嵌互译 callout。
- 多行 LaTeX 原样穿透。
- `<br>` 段落边界继续保留。

## 2. 普通标题

标题作为一个完整句子，使用：

```text
^sid-块序号-句序号
```

格式：

```md
# Investment Philosophies 101: A Life Cycle Overview
^sid-2-1

>[! ds]-
>![[chapters/章节名称/trans/trans2org 章节名称#^sid-2-1]]

<br>

```

`trans2org` 使用同一个 `^sid-2-1`，链接反向指向 `org2trans`。

## 3. 普通文本句子

段落按句对应，每句都有独立 `sid`。

段内句：

```md
WE ALL DREAM OF being super investors...
^sid-3-1
>[! ds]-
>![[chapters/章节名称/trans/trans2org 章节名称#^sid-3-1]]

下一句……
^sid-3-2
>[! ds]-
>![[chapters/章节名称/trans/trans2org 章节名称#^sid-3-2]]

```

段落最后一句结束后增加：

```md
最后一句……
^sid-3-4
>[! ds]-
>![[chapters/章节名称/trans/trans2org 章节名称#^sid-3-4]]

<br>

```

即：**句句对应，段尾才输出 `<br>`。**

## 4. 编号 / 项目符号段落

首句保留原列表符号，例如 `1.`、`-`、`*`。

```md
1. Illusory identicalness: For arbitrage...
^sid-79-1

>[! ds]-
![[chapters/章节名称/trans/trans2org 章节名称#^sid-79-1]]

>>
In practice, though, many settle for close...
^sid-79-2

>>[! ds]-
![[chapters/章节名称/trans/trans2org 章节名称#^sid-79-2]]

<br>

```

规则：

- 第一条句子保留项目符号。
- 首句 callout 为 `>[! ds]-`。
- 后续句前加独立一行 `>>`。
- 后续 callout 为 `>>[! ds]-`。
- 此类交叉链接行本身不加 `>`。
- 整个项目段落最后才输出 `<br>`。

## 5. 注释正文

注释正文**不做交叉互译链接**。

翻译时仍可逐句处理，但导出时重新合并成一个完整注释块：

```md
[^8]: 注释句子1. 注释句子2
<br>

```

原文侧同样：

```md
[^8]: Note sentence one. Note sentence two.
<br>

```

因此注释正文：

- 无 `^sid-*`
- 无 callout
- 无 `![[...]]`
- 保持原脚注编号
- 多个句子重新合并为一个脚注文本块

正文里的注释引用，例如：

```md
This is a claim.[^8]
```

仍作为普通正文句的一部分保留。

## 6. 合成块

图片标题、图片、图片说明、Notes、表格说明等连续内容属于**合成块**。

合成块内部不进行跨文件交叉链接，而是在原位置直接内嵌译文：

```md
>
Figure 2. How Berkshire Stacks Up
>>[! ds]-
>>图 2：伯克希尔的表现
>
![[imgs/example.jpg]]
>
Notes: This figure shows the distribution...
>>[! ds]-
>>注：本图显示相关分布……
>
```

规则：

- 不生成 `^sid-*`
- 不生成 `^bid-*`
- 不使用 `![[org2trans...]]` / `![[trans2org...]]`
- 图片保持原样
- HTML、`<embed>` 等结构保持原样
- 翻译直接放在当前层级的下一层 `>>[! ds]-`

`trans2org` 镜像处理：译文为正文，callout 内放原文。

## 7. 多行 LaTeX

完整：

```md
$$
E = mc^2
$$
```

直接原样穿透两个文件。

不：

- 翻译
- 分句
- 添加锚点
- 添加 callout
- 添加交叉链接

绝不能出现：

```md
$$
E = mc^2
^sid-...
$$
```

## 8. 行内 Markdown / LaTeX

这些结构在翻译前保护，翻译后原样恢复：

```text
$x+1$
[^8]
[^8]:
HTML 标签
[[wikilink]]
![[embed]]
URL
图片链接
代码片段
Markdown 链接目标
```

例如：

```md
Read [the source](https://example.com/a.b).
```

允许翻译链接显示文字：

```md
请阅读[资料来源](https://example.com/a.b)。
```

但链接目标必须保持不变。

## 9. `sid` 的基本原则

普通标题和普通正文使用：

```text
^sid-<文本块序号>-<句内序号>
```

例如：

```text
^sid-3-1
^sid-3-2
^sid-3-3
^sid-3-4
```

`org2trans` 与 `trans2org` 必须使用**完全相同的 sid、相同顺序、一一对应**。

以下内容不使用 `sid`：

```text
注释正文
合成块
图片
HTML
多行 LaTeX
```

## 10. 导出前硬校验

最终只有通过全部检查才写出两个正式文件：

```text
org2trans / trans2org 的 sid 数量、内容、顺序完全一致
纯译文 trans 文件中不存在 sid、跨文件锚点链接或交叉互译 ds callout
每个 sid 的双向链接实际存在且路径正确
链接中不带 .md
注释正文没有 sid/callout
合成块没有跨文件 sid/link
多行 LaTeX 没有 sid/callout
图片、HTML、脚注编号、URL、wikilink、代码、公式没有丢失
不存在未恢复的保护占位符
没有待翻译或失败单元
```

## 11. 总体原则

**普通正文逐句双向链接；列表保留层级；注释合并但不交叉；合成块原地内嵌互译；公式和结构元素原样穿透；同时生成一份无锚点、无 callout、无交叉链接的纯译文版。**
## 维护规则

- 只要交叉互译输出格式、元素规则、锚点规则、callout 层级、路径规则、保护规则或导出校验发生变动，就同步更新本文件，使其始终代表当前实现。

