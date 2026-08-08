# 隨附的框架

[English](../README.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

[README](../../docs/README.zh-TW.md) 描述的是機制——一份文庫,由 `agents-setup` 部署到 `~/.agents` 與各專案的 `.agents/`。本文件描述的則是那份文庫在 `payload/` 中所分發的內容:一套完整且可運作的框架——它作為範例隨附,供你據以起步並個人化。

## 為懂得判斷的模型而寫

本框架是為當前世代的模型而建構的——它們遵循判斷勝於遵循規則。每一條指令都是雙重的成本:它佔據工作階段有限的注意力,也在模型自身判斷可能更佳之處束縛了模型。因此文庫只記錄有能力的模型無法衍生的內容:

- **主張**——再強的能力也猜不出來的慣例:提交標題如何撰寫、什麼絕不寫進提交訊息
- **錨點**——一項工作必須滿足的外部權威文本:OWASP Top 10、WCAG 2.2 AA
- **邊界**——誰可以做什麼:一個無法編輯的審查者

其餘一切——如何搜尋、探究到多深、一項發現該長什麼樣——都交給模型。只有當某種失敗模式被實際觀察到時,才加入足以防止它的最小指令;不存在任何預先加入。校準所用的指南列於 [dotagents-prompting](../skills/dotagents-prompting/SKILL.md) 技能之中,並在編輯本文庫的任何提示詞之前先行閱讀。

## 三種傳遞形態

- **普遍**([AGENTS.md](../AGENTS.md))——注入每一次工作階段,對每一次工作階段的注意力課稅,因此它只容納一句話:_當實作或修復結束時,先把驗證委派給適用的審查代理,再回報完成。_
- **瞬時**([skills/](../skills/))——只在其時機到來時才被讀取:[dotagents-git](../skills/dotagents-git/SKILL.md) 在提交之時,[dotagents-prompting](../skills/dotagents-prompting/SKILL.md) 在編輯提示詞之時。寫在這裡的細節不會耗費任何其他時刻的成本。
- **角色**([agents/](../agents/))——擁有自己上下文與受限工具集的子代理。一個角色不得做什麼,由它未被授予的工具來強制,而非由一句它必須記住的話。

## 審查——一個乾淨的上下文,獵尋缺失之物

AI 代理特有的失敗模式,是明明沒做完卻說「做完了!」——其本質不是說謊,而是遺漏:一個只裝著自己寫下之物的上下文,看不見自己沒寫下之物。因此驗證交給上下文乾淨的審查代理。他們收到的是需求、如何定位對象、如何運行它——絕不包含實作者的自我報告。

[dotagents-review](../agents/dotagents-review.md) 依序進行兩趟掃描:

1. **存在性**——從每一條需求出發,找到滿足它的實作。遺漏在 diff 中是看不見的,因此掃描是從需求朝向程式碼進行,而不是從 diff 向外進行。
2. **正確性**——檢驗所找到的東西是否做得正確。

審查者只讀取與運行;他們不編輯。`Read, Glob, Grep, Bash` 就是全部的工具集。

## 需求錨點,而非檢查清單

[dotagents-security](../agents/dotagents-security.md) 依 [OWASP Top 10](https://owasp.org/Top10/) 進行驗證;[dotagents-accessibility](../agents/dotagents-accessibility.md) 依 [WCAG 2.2](https://www.w3.org/TR/WCAG22/) 符合性等級 AA 進行驗證。各自指名其權威文本,便到此為止:不複製檢查清單(複本會隨權威文本的演進而腐壞),不在其上疊加自家準則(列舉會把判斷束縛在列舉者的想像力之內)。哪個類別適用、如何適用,依眼前的程式碼來判斷。

## Git——模型猜不出來的慣例

[dotagents-git](../skills/dotagents-git/SKILL.md) 用寥寥數行容納了全部主張:提交標題陳述對業務而言改變了什麼,絕不寫檔名或內部識別字;提交訊息與 PR 中不留 AI 署名;整合以 squash 為預設;以重訂基底而非合併來跟隨上游。
