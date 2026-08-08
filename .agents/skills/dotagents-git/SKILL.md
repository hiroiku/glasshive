---
name: dotagents-git
description: git のコミットや push を行うときに使用する。
---

# Git のガイドライン

- コミットタイトルは「業務上、何が変わったか」を書く。ファイル名やコードの内部識別子を主語にしない。
- AI の関与を示す表記 (Co-Authored-By、Generated with など) をコミットメッセージや PR に書かない。
- 統合は squash を既定にする。
- 上流への追従は merge ではなく rebase で行う。
