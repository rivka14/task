export interface MonthlyBreakdown {
  month: string;
  clicks: number;
  earnings: string;
}

export interface LinkStatsItem {
  shortCode: string;
  url: string;
  totalClicks: number;
  totalEarnings: string;
  monthlyBreakdown: MonthlyBreakdown[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface LinkStatsResponse {
  data: LinkStatsItem[];
  meta: PaginationMeta;
}
