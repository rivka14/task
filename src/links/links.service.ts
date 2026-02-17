import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FraudService } from '../fraud/fraud.service';
import { LinkStatsResponse } from './dto/link-stats.dto';

@Injectable()
export class LinksService {
  private readonly logger = new Logger(LinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fraudService: FraudService,
  ) {}

  async createLink(targetUrl: string): Promise<{ shortCode: string; targetUrl: string; isNew: boolean }> {
    const existing = await this.prisma.link.findUnique({
      where: { targetUrl },
    });

    if (existing) {
      this.logger.log(`Existing link found for URL: ${targetUrl} -> ${existing.shortCode}`);
      return { shortCode: existing.shortCode, targetUrl: existing.targetUrl, isNew: false };
    }

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const shortCode = nanoid(8);
        const link = await this.prisma.link.create({
          data: { shortCode, targetUrl },
        });
        this.logger.log(`New link created: ${link.shortCode} -> ${targetUrl}`);
        return { shortCode: link.shortCode, targetUrl: link.targetUrl, isNew: true };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const target = error.meta?.target;
          if (Array.isArray(target) && target.includes('target_url')) {
            const existing = await this.prisma.link.findUnique({ where: { targetUrl } });
            if (existing) {
              this.logger.log(`Existing link found (race condition) for URL: ${targetUrl} -> ${existing.shortCode}`);
              return { shortCode: existing.shortCode, targetUrl: existing.targetUrl, isNew: false };
            }
          }
          this.logger.warn(`Short code collision on attempt ${attempt + 1}/${maxRetries}`);
          if (attempt === maxRetries - 1) throw error;
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to generate unique short code after retries');
  }

  async resolve(shortCode: string): Promise<string> {
    const link = await this.prisma.link.findUnique({
      where: { shortCode },
    });

    if (!link) {
      this.logger.warn(`Short code not found: ${shortCode}`);
      throw new NotFoundException('Short link not found');
    }

    this.logger.log(`Resolved ${shortCode} -> ${link.targetUrl}`);
    return link.targetUrl;
  }

  async recordClick(shortCode: string): Promise<void> {
    const link = await this.prisma.link.findUnique({
      where: { shortCode },
    });

    if (!link) {
      this.logger.warn(`Click recording skipped — link not found: ${shortCode}`);
      return;
    }

    const isValid = await this.fraudService.validate();
    const earnedCredit = isValid ? new Prisma.Decimal('0.05') : new Prisma.Decimal('0.00');

    await this.prisma.click.create({
      data: {
        linkId: link.id,
        isValid,
        earnedCredit,
      },
    });

    this.logger.log(
      `Click recorded for ${shortCode}: valid=${isValid}, earned=${earnedCredit}`,
    );
  }

  async getStats(page: number, limit: number): Promise<LinkStatsResponse> {
    const [links, totalItems] = await Promise.all([
      this.prisma.link.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.link.count(),
    ]);

    const data = await Promise.all(
      links.map(async (link) => {
        const aggregation = await this.prisma.click.aggregate({
          where: { linkId: link.id },
          _count: true,
          _sum: { earnedCredit: true },
        });

        const monthlyRaw = await this.prisma.$queryRaw<
          Array<{ month: Date; clicks: bigint; earnings: Prisma.Decimal }>
        >`
          SELECT
            DATE_TRUNC('month', clicked_at) AS month,
            COUNT(*)::bigint AS clicks,
            COALESCE(SUM(earned_credit), 0) AS earnings
          FROM clicks
          WHERE link_id = ${link.id}
          GROUP BY DATE_TRUNC('month', clicked_at)
          ORDER BY month ASC
        `;

        const monthlyBreakdown = monthlyRaw.map((row) => {
          const date = new Date(row.month);
          const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
          const yyyy = date.getUTCFullYear();
          return {
            month: `${mm}/${yyyy}`,
            clicks: Number(row.clicks),
            earnings: Number(row.earnings).toFixed(2),
          };
        });

        return {
          shortCode: link.shortCode,
          url: link.targetUrl,
          totalClicks: aggregation._count,
          totalEarnings: (Number(aggregation._sum.earnedCredit) || 0).toFixed(2),
          monthlyBreakdown,
        };
      }),
    );

    return {
      data,
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }
}
