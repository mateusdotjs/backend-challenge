import { Injectable } from '@nestjs/common';

import { ClockPort } from '../../application/ports/clock.port.js';

@Injectable()
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}

export const CLOCK = 'ClockPort';
