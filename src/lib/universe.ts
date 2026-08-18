import type { AssetType } from "./types";

/**
 * Universe MVP bersifat STATIS (PRD §7 poin 1) — bukan seluruh market.
 * Alasannya: free tier provider 5-60 calls/menit, jadi jumlah aset harus
 * bisa direfresh habis dalam satu siklus job tanpa kena rate limit.
 *
 * Kripto tidak didaftar manual di sini — di-seed dari CoinGecko top-100 by
 * market cap saat `npm run seed:universe`.
 */

export interface UniverseEntry {
  ticker: string;
  name: string;
  assetType: AssetType;
  exchange: string;
  currency: string;
  /** simbol untuk provider harga (Yahoo chart endpoint) */
  providerSymbol: string;
  sector?: string;
}

const US: [string, string, string][] = [
  ["AAPL", "Apple Inc.", "Technology"],
  ["MSFT", "Microsoft Corporation", "Technology"],
  ["NVDA", "NVIDIA Corporation", "Technology"],
  ["GOOGL", "Alphabet Inc.", "Communication Services"],
  ["AMZN", "Amazon.com Inc.", "Consumer Discretionary"],
  ["META", "Meta Platforms Inc.", "Communication Services"],
  ["AVGO", "Broadcom Inc.", "Technology"],
  ["TSLA", "Tesla Inc.", "Consumer Discretionary"],
  ["BRK-B", "Berkshire Hathaway Inc.", "Financials"],
  ["JPM", "JPMorgan Chase & Co.", "Financials"],
  ["V", "Visa Inc.", "Financials"],
  ["MA", "Mastercard Inc.", "Financials"],
  ["LLY", "Eli Lilly and Company", "Health Care"],
  ["UNH", "UnitedHealth Group Inc.", "Health Care"],
  ["JNJ", "Johnson & Johnson", "Health Care"],
  ["XOM", "Exxon Mobil Corporation", "Energy"],
  ["CVX", "Chevron Corporation", "Energy"],
  ["WMT", "Walmart Inc.", "Consumer Staples"],
  ["PG", "Procter & Gamble Co.", "Consumer Staples"],
  ["COST", "Costco Wholesale Corporation", "Consumer Staples"],
  ["HD", "Home Depot Inc.", "Consumer Discretionary"],
  ["MRK", "Merck & Co. Inc.", "Health Care"],
  ["ABBV", "AbbVie Inc.", "Health Care"],
  ["PEP", "PepsiCo Inc.", "Consumer Staples"],
  ["KO", "Coca-Cola Company", "Consumer Staples"],
  ["ADBE", "Adobe Inc.", "Technology"],
  ["CRM", "Salesforce Inc.", "Technology"],
  ["AMD", "Advanced Micro Devices Inc.", "Technology"],
  ["NFLX", "Netflix Inc.", "Communication Services"],
  ["CSCO", "Cisco Systems Inc.", "Technology"],
  ["ACN", "Accenture plc", "Technology"],
  ["TMO", "Thermo Fisher Scientific Inc.", "Health Care"],
  ["MCD", "McDonalds Corporation", "Consumer Discretionary"],
  ["ABT", "Abbott Laboratories", "Health Care"],
  ["DHR", "Danaher Corporation", "Health Care"],
  ["INTC", "Intel Corporation", "Technology"],
  ["QCOM", "QUALCOMM Inc.", "Technology"],
  ["TXN", "Texas Instruments Inc.", "Technology"],
  ["INTU", "Intuit Inc.", "Technology"],
  ["IBM", "International Business Machines", "Technology"],
  ["ORCL", "Oracle Corporation", "Technology"],
  ["NOW", "ServiceNow Inc.", "Technology"],
  ["AMAT", "Applied Materials Inc.", "Technology"],
  ["MU", "Micron Technology Inc.", "Technology"],
  ["LRCX", "Lam Research Corporation", "Technology"],
  ["BKNG", "Booking Holdings Inc.", "Consumer Discretionary"],
  ["NKE", "NIKE Inc.", "Consumer Discretionary"],
  ["SBUX", "Starbucks Corporation", "Consumer Discretionary"],
  ["LOW", "Lowes Companies Inc.", "Consumer Discretionary"],
  ["TJX", "TJX Companies Inc.", "Consumer Discretionary"],
  ["BAC", "Bank of America Corporation", "Financials"],
  ["WFC", "Wells Fargo & Company", "Financials"],
  ["GS", "Goldman Sachs Group Inc.", "Financials"],
  ["MS", "Morgan Stanley", "Financials"],
  ["BLK", "BlackRock Inc.", "Financials"],
  ["SPGI", "S&P Global Inc.", "Financials"],
  ["AXP", "American Express Company", "Financials"],
  ["C", "Citigroup Inc.", "Financials"],
  ["SCHW", "Charles Schwab Corporation", "Financials"],
  ["CAT", "Caterpillar Inc.", "Industrials"],
  ["DE", "Deere & Company", "Industrials"],
  ["HON", "Honeywell International Inc.", "Industrials"],
  ["GE", "GE Aerospace", "Industrials"],
  ["BA", "Boeing Company", "Industrials"],
  ["RTX", "RTX Corporation", "Industrials"],
  ["LMT", "Lockheed Martin Corporation", "Industrials"],
  ["UPS", "United Parcel Service Inc.", "Industrials"],
  ["UNP", "Union Pacific Corporation", "Industrials"],
  ["LIN", "Linde plc", "Materials"],
  ["SHW", "Sherwin-Williams Company", "Materials"],
  ["FCX", "Freeport-McMoRan Inc.", "Materials"],
  ["NEM", "Newmont Corporation", "Materials"],
  ["NEE", "NextEra Energy Inc.", "Utilities"],
  ["DUK", "Duke Energy Corporation", "Utilities"],
  ["SO", "Southern Company", "Utilities"],
  ["COP", "ConocoPhillips", "Energy"],
  ["SLB", "SLB", "Energy"],
  ["EOG", "EOG Resources Inc.", "Energy"],
  ["PSX", "Phillips 66", "Energy"],
  ["AMT", "American Tower Corporation", "Real Estate"],
  ["PLD", "Prologis Inc.", "Real Estate"],
  ["O", "Realty Income Corporation", "Real Estate"],
  ["DIS", "Walt Disney Company", "Communication Services"],
  ["CMCSA", "Comcast Corporation", "Communication Services"],
  ["T", "AT&T Inc.", "Communication Services"],
  ["VZ", "Verizon Communications Inc.", "Communication Services"],
  ["PFE", "Pfizer Inc.", "Health Care"],
  ["BMY", "Bristol-Myers Squibb Company", "Health Care"],
  ["AMGN", "Amgen Inc.", "Health Care"],
  ["GILD", "Gilead Sciences Inc.", "Health Care"],
  ["CVS", "CVS Health Corporation", "Health Care"],
  ["MDT", "Medtronic plc", "Health Care"],
  ["ISRG", "Intuitive Surgical Inc.", "Health Care"],
  ["VRTX", "Vertex Pharmaceuticals Inc.", "Health Care"],
  ["REGN", "Regeneron Pharmaceuticals Inc.", "Health Care"],
  ["PANW", "Palo Alto Networks Inc.", "Technology"],
  ["SNOW", "Snowflake Inc.", "Technology"],
  ["UBER", "Uber Technologies Inc.", "Industrials"],
  ["PYPL", "PayPal Holdings Inc.", "Financials"],
  ["SHOP", "Shopify Inc.", "Technology"],
  ["COIN", "Coinbase Global Inc.", "Financials"],
  ["PLTR", "Palantir Technologies Inc.", "Technology"],
  ["MDLZ", "Mondelez International Inc.", "Consumer Staples"],
  ["CL", "Colgate-Palmolive Company", "Consumer Staples"],
  ["MO", "Altria Group Inc.", "Consumer Staples"],
  ["GM", "General Motors Company", "Consumer Discretionary"],
  ["F", "Ford Motor Company", "Consumer Discretionary"],
];

/** LQ45 + blue chip IDX. Data fundamental TIDAK tersedia gratis — lihat PRD §4. */
const IDX: [string, string, string][] = [
  ["BBCA", "Bank Central Asia Tbk", "Keuangan"],
  ["BBRI", "Bank Rakyat Indonesia Tbk", "Keuangan"],
  ["BMRI", "Bank Mandiri Tbk", "Keuangan"],
  ["BBNI", "Bank Negara Indonesia Tbk", "Keuangan"],
  ["BRIS", "Bank Syariah Indonesia Tbk", "Keuangan"],
  ["BBTN", "Bank Tabungan Negara Tbk", "Keuangan"],
  ["ARTO", "Bank Jago Tbk", "Keuangan"],
  ["TLKM", "Telkom Indonesia Tbk", "Infrastruktur"],
  ["ASII", "Astra International Tbk", "Perindustrian"],
  ["UNVR", "Unilever Indonesia Tbk", "Konsumen Primer"],
  ["ICBP", "Indofood CBP Sukses Makmur Tbk", "Konsumen Primer"],
  ["INDF", "Indofood Sukses Makmur Tbk", "Konsumen Primer"],
  ["MYOR", "Mayora Indah Tbk", "Konsumen Primer"],
  ["GGRM", "Gudang Garam Tbk", "Konsumen Primer"],
  ["HMSP", "HM Sampoerna Tbk", "Konsumen Primer"],
  ["AMRT", "Sumber Alfaria Trijaya Tbk", "Konsumen Primer"],
  ["CPIN", "Charoen Pokphand Indonesia Tbk", "Konsumen Primer"],
  ["JPFA", "Japfa Comfeed Indonesia Tbk", "Konsumen Primer"],
  ["ADRO", "Alamtri Resources Indonesia Tbk", "Energi"],
  ["PTBA", "Bukit Asam Tbk", "Energi"],
  ["ITMG", "Indo Tambangraya Megah Tbk", "Energi"],
  ["MEDC", "Medco Energi Internasional Tbk", "Energi"],
  ["PGAS", "Perusahaan Gas Negara Tbk", "Energi"],
  ["AKRA", "AKR Corporindo Tbk", "Energi"],
  ["ANTM", "Aneka Tambang Tbk", "Barang Baku"],
  ["INCO", "Vale Indonesia Tbk", "Barang Baku"],
  ["TINS", "Timah Tbk", "Barang Baku"],
  ["MDKA", "Merdeka Copper Gold Tbk", "Barang Baku"],
  ["BRMS", "Bumi Resources Minerals Tbk", "Barang Baku"],
  ["INTP", "Indocement Tunggal Prakarsa Tbk", "Barang Baku"],
  ["SMGR", "Semen Indonesia Tbk", "Barang Baku"],
  ["BRPT", "Barito Pacific Tbk", "Barang Baku"],
  ["TPIA", "Chandra Asri Pacific Tbk", "Barang Baku"],
  ["ESSA", "ESSA Industries Indonesia Tbk", "Barang Baku"],
  ["KLBF", "Kalbe Farma Tbk", "Kesehatan"],
  ["SIDO", "Industri Jamu Sido Muncul Tbk", "Kesehatan"],
  ["MIKA", "Mitra Keluarga Karyasehat Tbk", "Kesehatan"],
  ["HEAL", "Medikaloka Hermina Tbk", "Kesehatan"],
  ["UNTR", "United Tractors Tbk", "Perindustrian"],
  ["EXCL", "XLSmart Telecom Sejahtera Tbk", "Infrastruktur"],
  ["ISAT", "Indosat Ooredoo Hutchison Tbk", "Infrastruktur"],
  ["TOWR", "Sarana Menara Nusantara Tbk", "Infrastruktur"],
  ["TBIG", "Tower Bersama Infrastructure Tbk", "Infrastruktur"],
  ["JSMR", "Jasa Marga Tbk", "Infrastruktur"],
  ["ADHI", "Adhi Karya Tbk", "Infrastruktur"],
  ["PTPP", "PP Tbk", "Infrastruktur"],
  ["WIKA", "Wijaya Karya Tbk", "Infrastruktur"],
  ["CTRA", "Ciputra Development Tbk", "Properti"],
  ["BSDE", "Bumi Serpong Damai Tbk", "Properti"],
  ["PWON", "Pakuwon Jati Tbk", "Properti"],
  ["SMRA", "Summarecon Agung Tbk", "Properti"],
  ["GOTO", "GoTo Gojek Tokopedia Tbk", "Teknologi"],
  ["BUKA", "Bukalapak.com Tbk", "Teknologi"],
  ["EMTK", "Elang Mahkota Teknologi Tbk", "Teknologi"],
  ["MNCN", "Media Nusantara Citra Tbk", "Konsumen Non-Primer"],
  ["ACES", "Aspirasi Hidup Indonesia Tbk", "Konsumen Non-Primer"],
  ["MAPI", "Mitra Adiperkasa Tbk", "Konsumen Non-Primer"],
  ["ERAA", "Erajaya Swasembada Tbk", "Konsumen Non-Primer"],
  ["SCMA", "Surya Citra Media Tbk", "Konsumen Non-Primer"],
];

export const US_UNIVERSE: UniverseEntry[] = US.map(([ticker, name, sector]) => ({
  ticker,
  name,
  assetType: "us_stock",
  exchange: "NASDAQ/NYSE",
  currency: "USD",
  providerSymbol: ticker,
  sector,
}));

export const IDX_UNIVERSE: UniverseEntry[] = IDX.map(([ticker, name, sector]) => ({
  ticker: `${ticker}.JK`,
  name,
  assetType: "idx_stock",
  exchange: "IDX",
  currency: "IDR",
  providerSymbol: `${ticker}.JK`,
  sector,
}));

/**
 * PRD §4: emas diwakili ETF GLD (+ futures GC=F sebagai proksi spot).
 * Diperlakukan sebagai price-only asset — scorer fundamental & valuasi di-skip.
 */
export const GOLD_UNIVERSE: UniverseEntry[] = [
  {
    ticker: "GLD",
    name: "SPDR Gold Shares (proksi emas)",
    assetType: "gold",
    exchange: "NYSE Arca",
    currency: "USD",
    providerSymbol: "GLD",
    sector: "Komoditas",
  },
  {
    ticker: "GC=F",
    name: "Gold Futures (proksi harga spot)",
    assetType: "gold",
    exchange: "COMEX",
    currency: "USD",
    providerSymbol: "GC=F",
    sector: "Komoditas",
  },
];

export const STATIC_UNIVERSE: UniverseEntry[] = [
  ...US_UNIVERSE,
  ...IDX_UNIVERSE,
  ...GOLD_UNIVERSE,
];

/** Berapa coin teratas yang di-seed dari CoinGecko. */
export const CRYPTO_TOP_N = 100;
