import { Logger } from '@nestjs/common';

/**
 * Per-call + per-reply latency profiler.
 * Reply marks reset each turn so REPLY_BREAKDOWN is not polluted by earlier turns.
 */
export class PerfTimer {
  private readonly logger = new Logger('PERF');
  private readonly t0: number;
  private readonly callMarks = new Map<string, number>();
  private turnMarks = new Map<string, number>();
  private turnT0 = 0;

  constructor(
    private readonly callSid: string,
    connectedAtMs?: number,
  ) {
    this.t0 = connectedAtMs ?? Date.now();
    this.callMarks.set('CallConnected', this.t0);
    this.logger.log(`call=${this.callSid} CallConnected +0ms`);
  }

  /** Call-lifetime mark (STTReady, GreetingFirstAudio, ElevenLabsConnection, …). */
  mark(name: string) {
    const at = Date.now();
    if (!this.callMarks.has(name)) {
      this.callMarks.set(name, at);
      this.logger.log(
        `call=${this.callSid} ${name} +${at - this.t0}ms total=${at - this.t0}ms`,
      );
    }
    return at;
  }

  /** Start a new user→agent reply measurement window. */
  beginReply() {
    this.turnT0 = Date.now();
    this.turnMarks = new Map([['ReplyStart', this.turnT0]]);
    this.logger.log(`call=${this.callSid} ReplyStart (turn reset)`);
  }

  /** Mark inside the current reply turn. */
  turn(name: string) {
    const at = Date.now();
    if (!this.turnMarks.has(name)) {
      this.turnMarks.set(name, at);
      const fromTurn = at - this.turnT0;
      this.logger.log(
        `call=${this.callSid} ${name} +${fromTurn}ms (turn) total=${at - this.t0}ms`,
      );
    }
    return at;
  }

  sinceCall(name: string): number {
    const m = this.callMarks.get(name);
    return m ? Date.now() - m : -1;
  }

  sinceTurn(name: string): number {
    const m = this.turnMarks.get(name);
    return m ? Date.now() - m : -1;
  }

  reportReplyPath() {
    const stages: Array<[string, string, string]> = [
      ['FirstPartialTranscript', 'FinalTranscript', 'STT_PARTIAL→FINAL'],
      ['FinalTranscript', 'GPTRequestStarted', 'QUEUE'],
      ['GPTRequestStarted', 'FirstGPTToken', 'GPT_TTFT'],
      ['FirstGPTToken', 'FirstCompleteSentence', 'GPT_SENTENCE'],
      ['FirstCompleteSentence', 'FirstAudioChunk', 'TTS_TTFB'],
      ['FinalTranscript', 'FirstAudioChunk', 'E2E_FIRST_AUDIO'],
      ['FinalTranscript', 'TotalResponseTime', 'E2E_COMPLETE'],
    ];
    // Fallback aliases if speculative path used FirstTranscript only
    const alias: Record<string, string> = {
      FinalTranscript: 'FinalTranscript',
    };
    const get = (n: string) =>
      this.turnMarks.get(n) ??
      this.turnMarks.get(alias[n]) ??
      this.turnMarks.get(
        n === 'FinalTranscript' ? 'FirstPartialTranscript' : n,
      );

    const parts: string[] = [];
    let worst = { name: '', ms: 0 };
    for (const [start, end, label] of stages) {
      const a = get(start);
      const b = get(end);
      if (a == null || b == null) continue;
      const ms = b - a;
      if (ms < 0) continue;
      parts.push(`${label}=${ms}ms`);
      if (ms > worst.ms) worst = { name: label, ms };
    }
    if (parts.length) {
      this.logger.log(
        `call=${this.callSid} REPLY_BREAKDOWN ${parts.join(' | ')} slowest=${worst.name}(${worst.ms}ms)`,
      );
      if (worst.ms > 400) {
        this.logger.warn(
          `BOTTLENECK_STAGE call=${this.callSid} ${worst.name}=${worst.ms}ms`,
        );
      }
    }

    const e2e = this.sinceTurn('FinalTranscript');
    if (e2e >= 0) {
      this.logger.log(`call=${this.callSid} TotalResponseTime=${e2e}ms`);
      if (e2e > 1000) {
        this.logger.warn(
          `BOTTLENECK call=${this.callSid} TotalResponseTime=${e2e}ms > 1000ms`,
        );
      } else if (e2e > 0) {
        this.logger.log(`TARGET_OK call=${this.callSid} TotalResponseTime=${e2e}ms`);
      }
    }
  }

  total(): number {
    return Date.now() - this.t0;
  }
}
