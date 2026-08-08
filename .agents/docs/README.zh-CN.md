# 随附的框架

[English](../README.md) | [日本語](README.ja.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

[README](../../docs/README.zh-CN.md) 描述的是机制——一份文库,由 `agents-setup` 部署到 `~/.agents` 与各项目的 `.agents/`。本文档描述的是这份文库在 `payload/` 中所分发的内容:一套完整、可运行的框架,作为你据以起步并加以个性化的样例一同随附。

## 为会做判断的模型而写

本框架为当前一代模型而构建——它们遵循判断胜过遵循规则。每一条指令都是一笔双重成本:它占据会话的有限注意力,并且在模型自身判断可能更优的地方束缚它。因此文库只记录一个有能力的模型无法自行派生的内容:

- **观点**——再强的能力也猜不出来的约定:提交标题如何撰写、什么绝不能写进提交信息
- **锚点**——一项工作必须满足的外部权威标准:OWASP Top 10、WCAG 2.2 AA
- **边界**——谁可以做什么:一个不能进行编辑的审查者

其余的一切——如何搜索、探究到多深、一条发现应当是什么样子——都交给模型。只有当某种失败模式被实际观察到时,才会加入能防止它的最小指令;绝不预先添加任何东西。校准所用的指南在 [dotagents-prompting](../skills/dotagents-prompting/SKILL.md) 技能中被指明,并会在编辑本文库的任何提示词之前先行阅读。

## 三种传递形态

- **普遍**([AGENTS.md](../AGENTS.md))——注入每一次会话,消耗每一次会话的注意力,因此它只容纳一句话:_当实现或修复结束时,先把验证委托给适用的审查代理,再报告完成。_
- **瞬时**([skills/](../skills/))——只在其时机到来时才被读取:[dotagents-git](../skills/dotagents-git/SKILL.md) 在提交之时,[dotagents-prompting](../skills/dotagents-prompting/SKILL.md) 在编辑提示词之时。写在这里的细节不会耗费任何其他时刻的成本。
- **角色**([agents/](../agents/))——拥有独立上下文与受限工具集的子代理。一个角色不得做什么,由不交给它的工具来强制,而不是由一句它必须记住的话来约束。

## 审查——用干净的上下文,搜寻缺失之物

AI 代理特有的失败模式,是明明没做完却说"做完了!"——其本质不是说谎,而是遗漏:一个只装着自己所写之物的上下文,看不见自己没有写下的东西。因此验证交给上下文干净的审查代理。它们收到的是需求、如何定位对象、如何运行它——绝不包含实现者的自我报告。

[dotagents-review](../agents/dotagents-review.md) 按顺序进行两轮扫描:

1. **存在性**——从每一条需求出发,找到满足它的实现。遗漏在 diff 中是不可见的,因此扫描从需求走向代码,而不是从 diff 向外展开。
2. **正确性**——检查所找到的东西是否做得正确。

审查者只读取与运行;它们不进行编辑。`Read, Glob, Grep, Bash` 就是全部工具集。

## 需求锚点,而非检查清单

[dotagents-security](../agents/dotagents-security.md) 对照 [OWASP Top 10](https://owasp.org/Top10/) 进行验证;[dotagents-accessibility](../agents/dotagents-accessibility.md) 对照 [WCAG 2.2](https://www.w3.org/TR/WCAG22/) 符合性级别 AA。每个角色只指明自己的权威标准,到此为止:不复制检查清单(权威标准演进时,副本便会腐坏),也不在其上叠加自家准则(枚举会把判断束缚在枚举者的想象力之内)。哪一条类别适用、如何适用,依据手头的代码来判断。

## Git——模型猜不出来的约定

[dotagents-git](../skills/dotagents-git/SKILL.md) 用寥寥数行容纳了全部观点:提交标题陈述对业务而言发生了什么变化,绝不写文件名或内部标识符;提交信息与 PR 中不出现 AI 署名;集成默认使用 squash;跟随上游用变基,而非合并。
