import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../users/users.service';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getFreeUsers(input: GetFreeUsersInput): Promise<User[]> {
    const from = this.parseIsoDate(input.from, 'from');
    const to = this.parseIsoDate(input.to, 'to');
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('from must be before to');
    }

    const tagFilter = this.normalizeTagsFromQuery(input.tags);

    const andTagFilters = tagFilter.map((name) => ({
      tags: {
        some: {
          tag: { name },
        },
      },
    }));

    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          ...andTagFilters,
          {
            busySlots: {
              none: {
                from: { lt: to },
                to: { gt: from },
              },
            },
          },
        ],
      },
      include: {
        tags: { include: { tag: true } },
        busySlots: true,
      },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone ?? undefined,
      tags: u.tags.map((t) => t.tag.name),
      busy: u.busySlots.map((s) => ({
        id: s.id,
        from: s.from.toISOString(),
        to: s.to.toISOString(),
        reason: s.reason ?? undefined,
      })),
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));
  }

  private normalizeTagsFromQuery(tags?: string | string[]): string[] {
    const raw: string[] = [];
    if (Array.isArray(tags)) {
      raw.push(...tags);
    } else if (typeof tags === 'string') {
      raw.push(...tags.split(','));
    }

    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of raw) {
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
}

export type GetFreeUsersInput = {
  from: string;
  to: string;
  tags?: string | string[];
};
