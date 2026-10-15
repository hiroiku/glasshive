## Git

- コミットタイトルには、業務にとって何が変わったかを書く。ファイル名や内部の識別子を主題にしない。
- コミットメッセージと PR に、Co-Authored-By や Generated with など AI の関与を示す記述を入れない。
- 統合は squash を既定とする。upstream への追従は merge ではなく rebase を使う。

### worktree と統合

- 作業ブランチは、作業ごとに worktree として作る。
- 統合は統合先ブランチの worktree で行う。共有ブランチで `git reset` を使わない。
- 統合担当は、取り込み後の組み合わせをプロジェクトの完了条件に従って検証し、統合による不具合を解消してから push する。
- worktree とブランチを削除する前に、その変更が統合先へ取り込まれ、統合先が origin へ push 済みであることを確かめる。

### PR と CI

- PR は draft で開き、変更と検証が完了した時点で ready にする。
- PR や push で何が実行されるかは、対象リポジトリーの workflow で確かめる。draft の PR でも CI が走ることがある。
