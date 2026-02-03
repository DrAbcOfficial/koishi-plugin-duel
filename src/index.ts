import { Bot, Context, Schema, Session } from 'koishi'

export const name = 'duel'

export interface Config {
  banTime: number,
  clearTime: number,
  countTime: number
}

export const Config: Schema<Config> = Schema.object({
  banTime: Schema.number().description("禁言时间（秒）").min(0).default(60),
  clearTime: Schema.number().description("清理决斗时间（秒），0为永不清理").min(0).default(60),
  countTime: Schema.number().description("决斗开始倒计时（秒）").min(0).default(5)
})

interface DuelPair {
  a: string;
  a_name: string;
  b: string | null;
  b_name: string | null;
  ok: boolean;
  startedAt?: number;
  clearTimer?: NodeJS.Timeout;
  countdownTimer?: NodeJS.Timeout;
}

const duelMap = new Map<string, DuelPair>();

function failed(session: Session, guildId: string, userId: string, banTime: number) {
  if(session.bot.muteGuildMember)
    session.bot.muteGuildMember(guildId, userId, banTime * 1000, "你在决斗中失败了");
  else
    session.send("但是这个平台不支持禁言😉");
}

function cleanupDuel(aId: string) {
  const pair = duelMap.get(aId);
  if (pair) {
    if (pair.clearTimer) clearTimeout(pair.clearTimer);
    if (pair.countdownTimer) clearTimeout(pair.countdownTimer);
    duelMap.delete(aId);
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.command('决斗', '开始决斗，等待他人加入')
    .action(async ({ session }) => {
      const userId = session.userId;
      const guildId = session.guildId;
      if(!guildId)
        return "这个命令不支持私聊";

      for (const [aId, pair] of duelMap.entries()) {
        if (pair.a === userId || pair.b === userId) {
          return '你已经参与一场决斗了！';
        }
      }

      for (const [aId, pair] of duelMap.entries()) {
        if (pair.b === null) {
          pair.b = userId;
          pair.b_name = session.username;

          if (pair.clearTimer) {
            clearTimeout(pair.clearTimer);
            pair.clearTimer = undefined;
          }

          pair.countdownTimer = setTimeout(() => {
            pair.ok = true;
            pair.startedAt = Date.now();
            session.send(`${pair.a_name} 与 ${pair.b_name} 的决斗开始了！快拔枪！`);
          }, config.countTime * 1000);

          return `${session.username} 加入了决斗！倒计时 ${config.countTime} 秒后开始！`;
        }
      }

      const newPair: DuelPair = {
        a: userId,
        a_name: session.username,
        b: null,
        b_name: null,
        ok: false,
      };

      duelMap.set(userId, newPair);

      if (config.clearTime > 0) {
        newPair.clearTimer = setTimeout(() => {
          session.send(`${newPair.a_name}的决斗无人应战已被取消，遗憾。`);
          duelMap.delete(userId);
        }, config.clearTime * 1000);
      }

      return `${session.username} 已开启决斗匹配，等待挑战者中${config.clearTime > 0 ? `（${config.clearTime}秒后自动取消）` : ''}！`;
    });

  ctx.command('拔枪', '在决斗中拔枪！')
    .action(({ session }) => {
      const userId = session.userId;
      const guildId = session.guildId;

      let foundPair: DuelPair | null = null;
      let isA = false;

      for (const [aId, pair] of duelMap.entries()) {
        if (pair.a === userId || pair.b === userId) {
          foundPair = pair;
          isA = pair.a === userId;
          break;
        }
      }

      if (!foundPair) {
        return '你没有参与任何决斗！';
      }

      if (foundPair.b === null) {
        return '别急，还没人和你配对！';
      }

      if (!foundPair.ok) {
        failed(session, guildId, userId, config.banTime);
        cleanupDuel(foundPair.a); 
        return `${session.username} 提前拔枪！被乱枪打死 ${config.banTime} 秒！`;
      }

      if (foundPair.startedAt === -1) {
        return '这场决斗已经结束了！';
      }

      foundPair.startedAt = -1;

      const winner = userId;
      const loser = isA ? foundPair.b! : foundPair.a;
      const winnerName = isA ? foundPair.a_name : foundPair.b_name!;
      const loserName = isA ? foundPair.b_name! : foundPair.a_name;

      failed(session, guildId, loser, config.banTime);

      cleanupDuel(foundPair.a);

      return `${winnerName} 成功击中 ${loserName} !${loserName}被打死 ${config.banTime} 秒！`;
    });
}