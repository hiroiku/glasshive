import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type { IssueLedgerRepository } from '~/application/ports/repositories/issues/issue-ledger.repository.ts';
import {
  createListIssues,
  type IssueLedger,
} from '~/application/use-cases/issues/list-issues.use-case.ts';

/* 台帳の字を課題へ読み解くのはここである、ということを固定する。
   読み解きの決まりそのものは domain の検査が持つ。ここで見るのは、字が届いてから
   出力になるまでの間で観測が潰れていないかである。 */

/** 台帳の字を返すだけの口。尋ねられた場所を覚える */
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

/** 断りようのない求めなので、受理されたことを確かめてから中身を見る */
async function observe(
  ledger: IssueLedgerRepository,
  includeClosed = false,
): Promise<Observation<IssueLedger>> {
  const result = await createListIssues({ ledger }).execute({
    projectPath: '/nest',
    includeClosed,
  });
  if (!result.ok) throw new Error('一覧の求めは断られない');
  return result.value;
}

describe('巣ひとつぶんの課題を一覧にする', () => {
  it('台帳の字を読み解いて、閉じた課題は落としつつ札には数える', async () => {
    const observation = await observe(ledgerOf(observed(LEDGER)));

    if (observation.kind !== 'observed') throw new Error(`読めなかった: ${observation.kind}`);
    expect(observation.value.issues.map((issue) => issue.id)).toEqual(['x-1']);
    expect(observation.value.counts, '落とした課題も札には出る').toEqual({
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

  it('尋ねられた巣の場所を、そのまま口へ渡す', async () => {
    const ledger = ledgerOf(observed(LEDGER));
    await observe(ledger);
    expect(ledger.asked, '別の場所の台帳を、尋ねられた巣の台帳として読まない').toEqual(['/nest']);
  });

  it('台帳が無いことを、空の一覧に潰さない', async () => {
    const observation = await observe(ledgerOf(absent('no-source')));
    expect(
      observation,
      '潰すと、bd を使っていない巣と課題が 1 件も無い巣が観る人には同じに見える',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('見に行けなかったことも、空の一覧に潰さない', async () => {
    const error = new UnexpectedError('台帳を読めなかった');
    const observation = await observe(ledgerOf(unobservable(error)));

    if (observation.kind !== 'unobservable') throw new Error('読めなさが消えている');
    expect(observation.error, '言い分をそのまま外まで運ぶ').toBe(error);
  });

  it('空の台帳は、課題も件数も空として見えたことにする', async () => {
    const observation = await observe(ledgerOf(observed('')));
    expect(observation, '読めたうえで 1 件も無いのは、読めなかったのとは別の事実である').toEqual({
      kind: 'observed',
      value: { issues: [], counts: {} },
    });
  });
});
