import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput): Promise<User> {
    if (!input.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    if (!input.email?.trim()) {
      throw new BadRequestException('email is required');
    }

    const id = this.generateUserId();
    const tags = this.normalizeTags(input.tags ?? []);

    try {
      const created = await this.prisma.user.create({
        data: {
          id,
          name: input.name,
          email: input.email,
          phone: input.phone,
          tags: {
            create: tags.map((name) => ({
              tag: {
                connectOrCreate: {
                  where: { name },
                  create: { name },
                },
              },
            })),
          },
        },
        include: { tags: { include: { tag: true } }, busySlots: true },
      });

      return this.toApiUser(created);
    } catch (e: any) {
      if (e?.code !== 'P2002') {
        throw e;
      }

      const existing = await this.prisma.user.findUnique({
        where: { email: input.email },
        include: { tags: { include: { tag: true } }, busySlots: true },
      });

      if (!existing) {
        throw e;
      }

      const reset = await this.prisma.$transaction(async (tx) => {
        await tx.busySlot.deleteMany({ where: { userId: existing.id } });
        await tx.userTag.deleteMany({ where: { userId: existing.id } });

        for (const name of tags) {
          const tag = await tx.tag.upsert({
            where: { name },
            update: {},
            create: { name },
          });
          await tx.userTag.upsert({
            where: { userId_tagId: { userId: existing.id, tagId: tag.id } },
            update: {},
            create: { userId: existing.id, tagId: tag.id },
          });
        }

        return tx.user.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            phone: input.phone,
          },
          include: { tags: { include: { tag: true } }, busySlots: true },
        });
      });

      return this.toApiUser(reset);
    }
  }

  async getById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { tags: { include: { tag: true } }, busySlots: true },
    });
    if (!user) throw new NotFoundException('user not found');
    return this.toApiUser(user);
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    if (input.name !== undefined && !input.name?.trim()) {
      throw new BadRequestException('name cannot be empty');
    }
    if (input.email !== undefined && !input.email?.trim()) {
      throw new BadRequestException('email cannot be empty');
    }

    const tags = input.tags ? this.normalizeTags(input.tags) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('user not found');

      if (tags) {
        await tx.userTag.deleteMany({ where: { userId: id } });
        for (const name of tags) {
          const tag = await tx.tag.upsert({
            where: { name },
            update: {},
            create: { name },
          });
          await tx.userTag.upsert({
            where: { userId_tagId: { userId: id, tagId: tag.id } },
            update: {},
            create: { userId: id, tagId: tag.id },
          });
        }
      }

      return tx.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
        },
        include: { tags: { include: { tag: true } }, busySlots: true },
      });
    });

    return this.toApiUser(updated);
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch {
      throw new NotFoundException('user not found');
    }
  }

  async updateTags(id: string, input: UpdateUserTagsInput): Promise<User> {
    const add = this.normalizeTags(input.add ?? []);
    const remove = this.normalizeTags(input.remove ?? []);

    const updated = await this.prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('user not found');

      for (const name of add) {
        const tag = await tx.tag.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        await tx.userTag.upsert({
          where: { userId_tagId: { userId: id, tagId: tag.id } },
          update: {},
          create: { userId: id, tagId: tag.id },
        });
      }

      if (remove.length > 0) {
        await tx.userTag.deleteMany({
          where: { userId: id, tag: { name: { in: remove } } },
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id },
        include: { tags: { include: { tag: true } }, busySlots: true },
      });
    });

    return this.toApiUser(updated);
  }

  async markBusy(id: string, input: MarkBusyInput): Promise<BusySlot> {
    const from = this.parseIsoDate(input.from, 'from');
    const to = this.parseIsoDate(input.to, 'to');
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('from must be before to');
    }

    const userExists = await this.prisma.user.findUnique({ where: { id } });
    if (!userExists) throw new NotFoundException('user not found');

    const slot = await this.prisma.busySlot.create({
      data: {
        userId: id,
        from,
        to,
        reason: input.reason,
      },
    });

    return {
      id: slot.id,
      from: slot.from.toISOString(),
      to: slot.to.toISOString(),
      reason: slot.reason ?? undefined,
    };
  }

  async listAll(): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      include: { tags: { include: { tag: true } }, busySlots: true },
    });
    return users.map((u) => this.toApiUser(u));
  }

  private normalizeTags(tags: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of tags ?? []) {
      const normalized = `${t ?? ''}`.trim();
      if (!normalized) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  private parseIsoDate(value: string, field: string): Date {
    if (!value?.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO datetime`);
    }
    return d;
  }

  private generateUserId(): string {
    const suffix = Math.random().toString(36).slice(2, 10);
    return `usr_${suffix}`;
  }

  private generateBusyId(): string {
    const suffix = Math.random().toString(36).slice(2, 10);
    return `busy_${suffix}`;
  }

  private toApiUser(user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
    tags: { tag: { name: string } }[];
    busySlots: { id: string; from: Date; to: Date; reason: string | null }[];
  }): User {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? undefined,
      tags: user.tags.map((t) => t.tag.name),
      busy: user.busySlots.map((s) => ({
        id: s.id,
        from: s.from.toISOString(),
        to: s.to.toISOString(),
        reason: s.reason ?? undefined,
      })),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  tags: string[];
  busy: BusySlot[];
  createdAt: string;
  updatedAt: string;
};

export type BusySlot = {
  id: string;
  from: string;
  to: string;
  reason?: string;
};

export type CreateUserInput = {
  name: string;
  email: string;
  phone?: string;
  tags?: string[];
};

export type UpdateUserInput = {
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
};

export type UpdateUserTagsInput = {
  add?: string[];
  remove?: string[];
};

export type MarkBusyInput = {
  from: string;
  to: string;
  reason?: string;
};
