---
name: prompting
description: プロンプト、指示ファイル、エージェント定義を更新するときに使う。
---

# 指示の更新

プロンプトやエージェント定義を変更する前に、次のガイドラインを読む。

- [2025/09/29: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [2026/07/24: The new rules of context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models)
- [2026/08/14: Maximizing the value of your Claude Code sessions](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions)

## 文脈の入り口を決める

指示は、トピックごとに、どこから文脈に入るかを先に決めてから書く。同じトピックを複数の入り口で書くと、片方だけが直されて食い違い、優先される側に残った断片が、もう片方の指示を打ち消す。

1. 常に読まれる配ったルールが持つトピックは、プロジェクトの AGENTS.md に一切書かない。
2. 必要なときに読まれる配ったスキルが持つトピックも書かない。プロジェクトによって違う点は、プロジェクトの正本の文書(配置規則など)に置く。
3. ファイルを見れば分かること(コマンド、script の中身、workflow、設定の値、フレームワークの一般的な知識)は、どこにも書かない。
4. 複数のプロジェクトに共通する方針は、プロジェクトに書かずに配るモジュールへ上げる。
5. プロジェクトの AGENTS.md に残すのは、上のどれにも当てはまらず、ファイルからも分からないプロジェクトの決めごとだけにする。

重なりを減らすときは、重なった文だけを削らない。トピックごとに入り口を決め直し、入り口でない側からはそのトピックを丸ごと消す。
