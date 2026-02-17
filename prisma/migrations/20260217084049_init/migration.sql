CREATE TABLE "links" (
    "id" SERIAL NOT NULL,
    "short_code" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clicks" (
    "id" SERIAL NOT NULL,
    "link_id" INTEGER NOT NULL,
    "is_valid" BOOLEAN NOT NULL,
    "earned_credit" DECIMAL(10,2) NOT NULL,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clicks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "links_short_code_key" ON "links"("short_code");

CREATE UNIQUE INDEX "links_target_url_key" ON "links"("target_url");

CREATE INDEX "clicks_link_id_clicked_at_idx" ON "clicks"("link_id", "clicked_at");

ALTER TABLE "clicks" ADD CONSTRAINT "clicks_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
