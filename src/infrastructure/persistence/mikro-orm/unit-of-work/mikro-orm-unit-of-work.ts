import { Injectable } from '@nestjs/common';
import { MikroORM, RequestContext } from '@mikro-orm/core';

import type { UnitOfWorkPort } from '../../../../application/ports/unit-of-work.port.js';

@Injectable()
export class MikroOrmUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly orm: MikroORM) {}

  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.orm.em.transactional((txEm) =>
      RequestContext.create(txEm, work),
    );
  }
}
