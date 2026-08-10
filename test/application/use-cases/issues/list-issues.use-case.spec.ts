import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type { IssueLedgerRepository } from '~/application/ports/repositories/issues/issue-ledger.repository.ts';
import {
  createListIssues,
  type IssueLedger,
} from '~/application/use-cases/issues/list-issues.use-case.ts';

/* 台帳のテキストを課題へパースするのはここである、ということを固定する。
   パースの決まりそのものは domain のテストが持つ。ここで見るのは、テキストが届いてから
   出力になるまでの間で観測が潰れていないかである。 */

/** 台帳のテキストを返すだけのポート。尋ねられたパスを覚える */
function ledgerOf(text: Observation<string>): IssueLedgerRepository & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async readLedgerText(projectPath) {
      asked.push(projectPath);
      return text;
    },
  };
}

const LEDGER = `${[
  { _type: 'issue', id: 'x-1', title: '生きている', status: 'open' },
  {
    _type: 'issue',
    id: 'x-2',
    title: '済み',
    status: 'closed',
    description: '巨大な本文',
  },
]
  .map((record) => JSON.stringify(record))
  .join('\n')}\n`;

/** 断りようのない呼び出しなので、受理されたことを確かめてから中身を見る */
async function observe(
  ledger: IssueLedgerRepository,
  includeClosed = false,
): Promise<Observation<IssueLedger>> {
  const result = await createListIssues({ ledger }).execute({
    projectPath: '/nest',
    includeClosed,
  });
  if (!result.ok) throw new Error('一覧の呼び出しは断られない');
  return result.value;
}

describe('プロジェクト 1 つぶんの課題を一覧にする', () => {
  it('台帳のテキストをパースして、閉じた課題は落としつつ件数には数える', async () => {
    const observation = await observe(ledgerOf(observed(LEDGER)));

    if (observation.kind !== 'observed') throw new Error(`読めなかった: ${observation.kind}`);
    expect(observation.value.issues.map((issue) => issue.id)).toEqual(['x-1']);
    expect(observation.value.counts, '落とした課題も件数には出る').toEqual({
      open: 1,
      closed: 1,
    });
  });

  it('求められれば閉じた課題も一覧に載せる', async () => {
    const observation = await observe(ledgerOf(observed(LEDGER)), true);

    if (observation.kind !== 'observed') throw new Error(`読めなかった: ${observation.kind}`);
    expect(observation.value.issues.map((issue) => issue.id)).toEqual(['x-1', 'x-2']);
    expect(
      observation.value.issues.some((issue) => Object.hasOwn(issue, 'description')),
      '一覧に本文は載せない。数百件ぶんを一度に運ぶと一覧そのものが開かなくなる',
    ).toBe(false);
  });

  it('尋ねられたプロジェクトのパスを、そのままポートへ渡す', async () => {
    const ledger = ledgerOf(observed(LEDGER));
    await observe(ledger);
    expect(ledger.asked, '別のパスの台帳を、尋ねられたプロジェクトの台帳として読まない').toEqual([
      '/nest',
    ]);
  });

  it('台帳が無いことを、空の一覧に潰さない', async () => {
    const observation = await observe(ledgerOf(absent('no-source')));
    expect(
      observation,
      '潰すと、bd を使っていないプロジェクトと課題が 1 件も無いプロジェクトが、ユーザーには同じに見える',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('観測できなかったことも、空の一覧に潰さない', async () => {
    const error = new UnexpectedError('台帳を読めなかった');
    const observation = await observe(ledgerOf(unobservable(error)));

    if (observation.kind !== 'unobservable') throw new Error('観測できなかったことが消えている');
    expect(observation.error, 'エラーをそのまま外まで運ぶ').toBe(error);
  });

  it('空の台帳は、課題も件数も空として見えたことにする', async () => {
    const observation = await observe(ledgerOf(observed('')));
    expect(
      observation,
      '読めたうえで 1 件も無いのは、観測できなかったのとは別の事実である',
    ).toEqual({
      kind: 'observed',
      value: { issues: [], counts: {} },
    });
  });
});
