import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type { IssueLedgerRepository } from '~/application/ports/repositories/issues/issue-ledger.repository.ts';
import {
  createGetIssue,
  type IssueRecord,
} from '~/application/use-cases/issues/get-issue.use-case.ts';

/* 台帳の字から 1 件を引き当てるのはここである、ということを固定する。
   当たりの見付け方そのものは domain の検査が持つ。ここで見るのは、無かったことを
   どう言うかである — 台帳ごと無いのと、その課題だけが無いのは別の答えになる。 */

const RECORD = {
  _type: 'issue',
  id: 'x-1',
  status: 'open',
  title: '生きている',
  description: '巨大な本文',
};

const LEDGER = `${JSON.stringify(RECORD)}\n`;

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

/** 断りようのない求めなので、受理されたことを確かめてから中身を見る */
async function observe(
  ledger: IssueLedgerRepository,
  id = 'x-1',
): Promise<Observation<IssueRecord>> {
  const result = await createGetIssue({ ledger }).execute({
    projectPath: '/nest',
    id,
  });
  if (!result.ok) throw new Error('1 件の求めは断られない');
  return result.value;
}

describe('課題 1 件を引く', () => {
  it('台帳に書かれていた欄をぜんぶ返す', async () => {
    const observation = await observe(ledgerOf(observed(LEDGER)));
    expect(observation, '一覧が落とす本文も、1 件を引くときは返る').toEqual({
      kind: 'observed',
      value: RECORD,
    });
  });

  it('尋ねられた巣の場所を、そのまま口へ渡す', async () => {
    const ledger = ledgerOf(observed(LEDGER));
    await observe(ledger);
    expect(
      ledger.asked,
      '別の場所の台帳から引いた課題を、尋ねられた巣の課題として返さない',
    ).toEqual(['/nest']);
  });

  it('台帳は読めたがその課題が無いときは、空として返す', async () => {
    const observation = await observe(ledgerOf(observed(LEDGER)), 'x-9');
    expect(
      observation,
      '台帳ごと無いのと同じ答えにすると、bd を使っていない巣と課題を消した巣が見分けられない',
    ).toEqual({ kind: 'absent', reason: 'empty' });
  });

  it('台帳が無ければ、元が無いこととして返す', async () => {
    const observation = await observe(ledgerOf(absent('no-source')));
    expect(observation, '見に行けたうえで無かったのとは、別の事実である').toEqual({
      kind: 'absent',
      reason: 'no-source',
    });
  });

  it('見に行けなかったことを、「そんな課題は無い」に潰さない', async () => {
    const error = new UnexpectedError('台帳を読めなかった');
    const observation = await observe(ledgerOf(unobservable(error)));

    if (observation.kind !== 'unobservable') throw new Error('読めなさが消えている');
    expect(observation.error, '言い分をそのまま外まで運ぶ').toBe(error);
  });
});
