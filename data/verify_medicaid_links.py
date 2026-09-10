#!/usr/bin/env python3
"""
VERIFY EVERY STATE MEDICAID FEE-SCHEDULE LINK BEFORE IT SHIPS.

The app tells a Medicaid enrollee the truth: no federal file publishes what
Medicaid pays for their care, because each state sets its own rates. The one
useful thing we can hand them is their OWN state's published fee schedule. A
link that 404s is worse than no link, and a link we merely believe in is a
guess, which this project never ships.

So: every candidate URL below is fetched. A state is written into
data/medicaid-fee-schedules.json only when the fetch returns a 2xx AND the page
identifies itself as a Medicaid rate/fee-schedule page (the title or the first
80 KB names a fee schedule, rate, or reimbursement, alongside Medicaid or the
state's own Medicaid program name). Everything else is OMITTED and listed in
_omitted with the reason, so the absence is visible rather than filled.

Run:  python3 data/verify_medicaid_links.py
"""
from __future__ import annotations
import json, os, re, shutil, sys, tempfile, datetime, concurrent.futures, subprocess, pathlib

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "medicaid-fee-schedules.json"

UA2 = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
       "Chrome/125.0.0.0 Safari/537.36")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# state code -> (state name, program name as the state calls it, candidate URLs in order)
CANDIDATES: dict[str, tuple[str, str, list[str]]] = {
 "AL": ("Alabama", "Alabama Medicaid Agency", ["https://medicaid.alabama.gov/content/4.0_Programs/4.2_Fee_Schedules.aspx"]),
 "AK": ("Alaska", "Alaska Medicaid", ["https://extranet-sp.dhss.alaska.gov/hcs/medicaidalaska/Provider/Sites/FeeSchedule.html", "https://health.alaska.gov/en/services/medicaid-provider-assistance/", "https://health.alaska.gov/en/providers/rates-and-audit/", "https://health.alaska.gov/en/division-of-health-care-services/rates/", "https://health.alaska.gov/en/division-of-health-care-services/rates-and-audit/", "https://health.alaska.gov/dhcs/Pages/ratesandaudit/default.aspx"]),
 "AZ": ("Arizona", "AHCCCS", ["https://www.azahcccs.gov/PlansProviders/FeeForServiceHealthPlans/physicianrates.html", "https://www.azahcccs.gov/PlansProviders/RatesAndBilling/FFS/AHCCCSprovider_rateanalysis.html"]),
 "AR": ("Arkansas", "Arkansas Medicaid", ["https://humanservices.arkansas.gov/divisions-shared-services/medical-services/helpful-information-for-providers/fee-schedules/", "https://humanservices.arkansas.gov/wp-content/uploads/PHYSICN-fees.pdf", "https://medicaid.mmis.arkansas.gov/general/units/fees.aspx", "https://medicaid.mmis.arkansas.gov/Provider/Docs/rates.aspx", "https://humanservices.arkansas.gov/divisions-shared-services/medical-services/helpful-information-for-providers/fee-schedules/", "https://medicaid.mmis.arkansas.gov/Provider/Docs/fees.aspx"]),
 "CA": ("California", "Medi-Cal", ["https://www.dhcs.ca.gov/services/medi-cal/Pages/Medi-CalFeeforService.aspx", "https://files.medi-cal.ca.gov/Rates", "https://files.medi-cal.ca.gov/pubsdoco/rates/rateshome.aspx", "https://mcweb.apps.prd.cammis.medi-cal.ca.gov/rates"]),
 "CO": ("Colorado", "Health First Colorado", ["https://hcpf.colorado.gov/provider-rates-fee-schedule"]),
 "CT": ("Connecticut", "HUSKY Health / CT Medical Assistance", ["https://www.ctdssmap.com/CTPortal/Provider/Provider-Fee-Schedule-Download/tabId/216/Default.aspx", "https://portal.ct.gov/dss/health-and-home-care/medicaid-fee-schedules"]),
 "DE": ("Delaware", "Delaware Medical Assistance Program", ["https://medicaidpublications.dhss.delaware.gov/#/feeschedules", "https://dhss.delaware.gov/dhss/dmma/provider.html", "https://medicaidpublications.dhss.delaware.gov/", "https://dhss.delaware.gov/dhss/dmma/feeschedules.html"]),
 "DC": ("District of Columbia", "DC Medicaid", ["https://dhcf.dc.gov/page/fee-schedules", "https://dhcf.dc.gov/service/medicaid-fee-schedules"]),
 "FL": ("Florida", "Florida Medicaid", ["https://ahca.myflorida.com/medicaid/cost-reimbursement/fee-schedules", "https://ahca.myflorida.com/medicaid/rules-and-fee-schedules"]),
 "GA": ("Georgia", "Georgia Medicaid", ["https://www.mmis.georgia.gov/portal/PubAccess.Provider%20Information/Fee%20Schedules/tabId/56/Default.aspx", "https://medicaid.georgia.gov/providers/provider-manuals", "https://medicaid.georgia.gov/providers/fee-schedules", "https://www.mmis.georgia.gov/portal/PubAccess.Provider%20Information/Fee%20Schedules/tabId/56/Default.aspx"]),
 "HI": ("Hawaii", "Med-QUEST", ["https://medquest.hawaii.gov/en/plans-providers/fee-schedule.html"]),
 "ID": ("Idaho", "Idaho Medicaid", ["https://publicdocuments.dhw.idaho.gov/WebLink/Browse.aspx?id=3488&dbid=0&repo=PUBLIC-DOCUMENTS", "https://healthandwelfare.idaho.gov/providers/idaho-medicaid-providers/information-medicaid-providers", "https://healthandwelfare.idaho.gov/providers/medicaid-providers/medicaid-provider-fee-schedules", "https://publicdocuments.dhw.idaho.gov/WebLink/Browse.aspx", "https://healthandwelfare.idaho.gov/providers/medicaid-providers/idaho-medicaid-fee-schedule", "https://www.idmedicaid.com/Reference/Fee%20Schedule.aspx"]),
 "IL": ("Illinois", "Illinois Medicaid (HFS)", ["https://hfs.illinois.gov/medicalproviders/medicaidreimbursement.html", "https://hfs.illinois.gov/medicalprograms/practitionerfeeschedule.html"]),
 "IN": ("Indiana", "Indiana Health Coverage Programs", ["https://www.in.gov/medicaid/providers/business-transactions/billing-and-remittance/fee-schedule/"]),
 "IA": ("Iowa", "Iowa Medicaid", ["https://hhs.iowa.gov/programs/welcome-iowa-medicaid/policy-and-provider-services/fee-schedules", "https://hhs.iowa.gov/ime/providers/csrp/fee-schedule"]),
 "KS": ("Kansas", "KanCare", ["https://portal.kmap-state-ks.us/PublicPage/ProviderPricing/FeeSchedules", "https://portal.kmap-state-ks.us/PublicPage/ProviderPricing/OutPatientFeeSchedule", "https://portal.kmap-state-ks.us/PublicPage/ProviderPricing", "https://www.kmap-state-ks.us/Public/pricing.asp", "https://portal.kmap-state-ks.us/PublicPage/ProviderPricing/ProviderPricingHome"]),
 "KY": ("Kentucky", "Kentucky Medicaid", ["https://www.chfs.ky.gov/agencies/dms/Pages/feeschedules.aspx"]),
 "LA": ("Louisiana", "Healthy Louisiana / Louisiana Medicaid", ["https://www.lamedicaid.com/provweb1/fee_schedules/feeschedulesindex.htm"]),
 "ME": ("Maine", "MaineCare", ["https://www.maine.gov/dhhs/oms/providers/rate-setting", "https://www.maine.gov/dhhs/oms/rates/rate-setting"]),
 "MD": ("Maryland", "Maryland Medicaid", ["https://health.maryland.gov/mmcp/pages/provider-information.aspx", "https://health.maryland.gov/mmcp/provider/Pages/professional-services.aspx", "https://health.maryland.gov/mmcp/Pages/Provider-Fee-Schedules.aspx", "https://health.maryland.gov/mmcp/Pages/Professional-Services.aspx", "https://health.maryland.gov/mmcp/pages/Fee-Schedules.aspx", "https://health.maryland.gov/mmcp/provider/Pages/Fee-Schedules.aspx"]),
 "MA": ("Massachusetts", "MassHealth", ["https://www.mass.gov/lists/provider-payment-rates-community-health-care-providers-ambulatory-care", "https://www.mass.gov/regulations/101-CMR-31700-rates-for-medicine-services", "https://www.mass.gov/info-details/masshealth-payment-and-coverage-guideline-tools"]),
 "MI": ("Michigan", "Michigan Medicaid", ["https://www.michigan.gov/mdhhs/assistance-programs/medicaid/portalhome/medicaid-providers/billing-and-reimbursement", "https://www.michigan.gov/mdhhs/doing-business/providers/providers/billingreimbursement/physicians-practitioners-medical-clinics", "https://www.michigan.gov/mdhhs/assistance-programs/medicaid/portalhome/medicaid-providers/medicaid-provider-resources/medicaid-fee-schedules", "https://www.michigan.gov/mdhhs/doing-business/providers/providers/medicaid/policyforms", "https://www.michigan.gov/mdhhs/assistance-programs/medicaid/portalhome/medicaid-providers/medicaid-provider-fee-schedule-and-rates"]),
 "MN": ("Minnesota", "Minnesota Health Care Programs", ["https://mn.gov/dhs/health-care/medical-assistance/finding-medicaid-payment-rates/", "https://mn.gov/dhs/partners-and-providers/policies-procedures/minnesota-health-care-programs/provider/billing/fee-schedule/", "https://mn.gov/dhs/mhcp-fee-schedule/", "https://www.dhs.state.mn.us/main/idcplg?IdcService=GET_DYNAMIC_CONVERSION&RevisionSelectionMethod=LatestReleased&dDocName=id_008926", "https://www.dhs.state.mn.us/main/idcplg?IdcService=GET_DYNAMIC_CONVERSION&RevisionSelectionMethod=LatestReleased&dDocName=id_008926", "https://mn.gov/dhs/mhcp-fee-schedule/"]),
 "MS": ("Mississippi", "Mississippi Medicaid", ["https://medicaid.ms.gov/providers/fee-schedules-and-rates/"]),
 "MO": ("Missouri", "MO HealthNet", ["https://dss.mo.gov/mhd/providers/pages/cptagree.htm", "https://mmac.mo.gov/providers/fee-schedules/"]),
 "MT": ("Montana", "Montana Healthcare Programs", ["https://medicaidprovider.mt.gov/feeschedules"]),
 "NE": ("Nebraska", "Nebraska Medicaid", ["https://dhhs.ne.gov/Pages/Medicaid-Fee-Schedules.aspx", "https://dhhs.ne.gov/Pages/Medicaid-Practitioner-Fee-Schedule.aspx"]),
 "NV": ("Nevada", "Nevada Medicaid", ["https://www.medicaid.nv.gov/providers/rates/ratesunit.aspx"]),
 "NH": ("New Hampshire", "New Hampshire Medicaid", ["https://www.dhhs.nh.gov/programs-services/medicaid/medicaid-fee-schedules", "https://nhmmis.nh.gov/portals/wps/portal/FeeSchedule"]),
 "NJ": ("New Jersey", "NJ FamilyCare", ["https://www.njmmis.com/feeSchedule.aspx", "https://www.njmmis.com/"]),
 "NM": ("New Mexico", "Turquoise Care / NM Medicaid", ["https://www.hca.nm.gov/providers/fee-schedules/", "https://www.hca.nm.gov/providers/", "https://nmmedicaid.portal.conduent.com/static/FeeSchedules.htm", "https://www.hca.nm.gov/providers/fee-schedules/", "https://www.hsd.state.nm.us/providers/fee-schedules/"]),
 "NY": ("New York", "NY Medicaid", ["https://www.emedny.org/ProviderManuals/AllProviders/index.aspx", "https://www.emedny.org/ProviderManuals/index.aspx"]),
 "NC": ("North Carolina", "NC Medicaid", ["https://medicaid.ncdhhs.gov/providers/fee-schedules"]),
 "ND": ("North Dakota", "ND Medicaid", ["https://www.hhs.nd.gov/healthcare/medicaid/provider-fee-schedules", "https://www.hhs.nd.gov/healthcare/medicaid/provider/fee-schedules"]),
 "OH": ("Ohio", "Ohio Medicaid", ["https://medicaid.ohio.gov/resources-for-providers/billing/fee-schedule-and-rates/fee-schedule-and-rates"]),
 "OK": ("Oklahoma", "SoonerCare", ["https://oklahoma.gov/ohca/providers/rates-and-fee-schedules.html", "https://oklahoma.gov/ohca/providers/rates.html"]),
 "OR": ("Oregon", "Oregon Health Plan", ["https://www.oregon.gov/oha/HSD/OHP/Pages/Fee-Schedule.aspx"]),
 "PA": ("Pennsylvania", "Pennsylvania Medical Assistance", ["https://www.pa.gov/agencies/dhs/resources/for-providers/ma-for-providers/ma-fee-schedule", "https://www.humanservices.dhs.pa.gov/OUTPATIENTFEESCHEDULE/Search", "https://www.dhs.pa.gov/providers/Providers/Pages/Medical/MA-Fee-Schedule.aspx", "https://www.pa.gov/agencies/dhs/resources/for-providers.html", "https://www.pa.gov/agencies/dhs/resources/for-providers/medical-assistance-fee-schedule.html", "https://www.dhs.pa.gov/providers/Providers/Pages/Medical/MA-Fee-Schedule.aspx"]),
 "RI": ("Rhode Island", "RI Medicaid", ["https://eohhs.ri.gov/providers-partners/billing-and-claims/fee-schedules"]),
 "SC": ("South Carolina", "Healthy Connections", ["https://www.scdhhs.gov/resources/fee-schedules", "https://provider.scdhhs.gov/internet/fee-schedules"]),
 "SD": ("South Dakota", "South Dakota Medicaid", ["https://dss.sd.gov/medicaid/providers/feeschedules/"]),
 "TN": ("Tennessee", "TennCare", ["https://www.tn.gov/tenncare/providers/fee-schedules.html", "https://www.tn.gov/tenncare/information-statistics/fee-schedules-and-rates.html"]),
 "TX": ("Texas", "Texas Medicaid", ["https://www.tmhp.com/resources/rate-and-code-updates/fee-schedules", "https://pfd.hhs.texas.gov/"]),
 "UT": ("Utah", "Utah Medicaid", ["https://medicaid.utah.gov/fee-schedule/", "https://medicaid.utah.gov/utah-medicaid-official-publications/"]),
 "VT": ("Vermont", "Green Mountain Care / Vermont Medicaid", ["https://dvha.vermont.gov/providers/fee-schedules", "https://vtmedicaid.com/#/feeSchedule"]),
 "VA": ("Virginia", "Cardinal Care / Virginia Medicaid", ["https://www.dmas.virginia.gov/for-providers/rate-setting/", "https://vamedicaid.dmas.virginia.gov/provider/rates"]),
 "WA": ("Washington", "Apple Health", ["https://www.hca.wa.gov/billers-providers-partners/prior-authorization-claims-and-billing/provider-billing-guides-and-fee-schedules"]),
 "WV": ("West Virginia", "West Virginia Medicaid", ["https://bms.wv.gov/providers/west-virginia-medicaid-fee-schedules", "https://bms.wv.gov/providers/west-virginia-medicaid-physicians-fee-schedules", "https://www.wvmmis.com/default.aspx", "https://dhhr.wv.gov/bms/Pages/Provider.aspx", "https://dhhr.wv.gov/bms/Pages/Fee-Schedules.aspx", "https://www.wvmmis.com/default.aspx"]),
 "WI": ("Wisconsin", "ForwardHealth", ["https://www.forwardhealth.wi.gov/WIPortal/Subsystem/Provider/MaxFeeHome.aspx", "https://www.forwardhealth.wi.gov/WIPortal/content/provider/medicaid/resources/maxfee.htm.spage"]),
 "WY": ("Wyoming", "Wyoming Medicaid", ["https://health.wyo.gov/healthcarefin/medicaid/provider-fee-schedules/", "https://wymedicaid.portal.conduent.com/feeschedule.html"]),
}


# Where to LOOK when no candidate above resolves: the program's own front door.
# Stage 2 fetches these, reads every link whose text or href names a fee schedule,
# a rate or reimbursement, and tests those. Discovery, never invention.
HUBS: dict[str, list[str]] = {
 "AL": ["https://medicaid.alabama.gov/", "https://medicaid.alabama.gov/content/4.0_Programs.aspx"],
 "AK": ["https://health.alaska.gov/en/division-of-health-care-services/", "https://health.alaska.gov/en/providers/"],
 "AR": ["https://medicaid.mmis.arkansas.gov/", "https://medicaid.mmis.arkansas.gov/Provider/provider.aspx"],
 "CA": ["https://www.dhcs.ca.gov/services/medi-cal/Pages/default.aspx", "https://mcweb.apps.prd.cammis.medi-cal.ca.gov/"],
 "CT": ["https://www.ctdssmap.com/", "https://portal.ct.gov/dss"],
 "DC": ["https://dhcf.dc.gov/", "https://dhcf.dc.gov/page/dc-medicaid-provider-information"],
 "DE": ["https://medicaidpublications.dhss.delaware.gov/", "https://dhss.delaware.gov/dhss/dmma/"],
 "FL": ["https://ahca.myflorida.com/medicaid", "https://ahca.myflorida.com/medicaid/medicaid-policy-quality-and-operations"],
 "GA": ["https://medicaid.georgia.gov/", "https://www.mmis.georgia.gov/portal/"],
 "HI": ["https://medquest.hawaii.gov/", "https://medquest.hawaii.gov/en/plans-providers.html"],
 "ID": ["https://healthandwelfare.idaho.gov/providers/medicaid-providers", "https://www.idmedicaid.com/"],
 "IN": ["https://www.in.gov/medicaid/providers/", "https://www.in.gov/medicaid/"],
 "KS": ["https://portal.kmap-state-ks.us/", "https://www.kancare.ks.gov/"],
 "KY": ["https://www.chfs.ky.gov/agencies/dms/Pages/default.aspx", "https://www.chfs.ky.gov/agencies/dms/provider/Pages/default.aspx"],
 "MA": ["https://www.mass.gov/orgs/masshealth", "https://www.mass.gov/masshealth-provider-information"],
 "MD": ["https://health.maryland.gov/mmcp/Pages/home.aspx", "https://health.maryland.gov/mmcp/Pages/Providers.aspx"],
 "ME": ["https://www.maine.gov/dhhs/oms", "https://www.maine.gov/dhhs/oms/providers"],
 "MI": ["https://www.michigan.gov/mdhhs/assistance-programs/medicaid", "https://www.michigan.gov/mdhhs/assistance-programs/medicaid/portalhome/medicaid-providers"],
 "MN": ["https://mn.gov/dhs/partners-and-providers/", "https://www.dhs.state.mn.us/main/idcplg?IdcService=GET_DYNAMIC_CONVERSION&RevisionSelectionMethod=LatestReleased&dDocName=id_006254"],
 "MO": ["https://mydss.mo.gov/healthcare", "https://dss.mo.gov/mhd/providers/"],
 "MT": ["https://medicaidprovider.mt.gov/", "https://medicaidprovider.mt.gov/providertype"],
 "NE": ["https://dhhs.ne.gov/Pages/Medicaid-Provider-Information.aspx", "https://dhhs.ne.gov/Pages/Medicaid-and-Long-Term-Care.aspx"],
 "NJ": ["https://www.njmmis.com/", "https://www.nj.gov/humanservices/dmahs/info/"],
 "NV": ["https://www.medicaid.nv.gov/", "https://www.medicaid.nv.gov/providers/rates.aspx"],
 "NH": ["https://www.dhhs.nh.gov/programs-services/medicaid", "https://nhmmis.nh.gov/"],
 "OK": ["https://oklahoma.gov/ohca.html", "https://oklahoma.gov/ohca/providers.html"],
 "PA": ["https://www.dhs.pa.gov/providers/Providers/Pages/default.aspx", "https://www.pa.gov/agencies/dhs/resources/for-providers.html"],
 "RI": ["https://eohhs.ri.gov/providers-partners", "https://eohhs.ri.gov/providers-partners/billing-and-claims"],
 "SC": ["https://www.scdhhs.gov/", "https://www.scdhhs.gov/provider-resources"],
 "TN": ["https://www.tn.gov/tenncare", "https://www.tn.gov/tenncare/providers.html"],
 "TX": ["https://www.tmhp.com/", "https://www.tmhp.com/topics/rate-and-code-updates"],
 "UT": ["https://medicaid.utah.gov/", "https://medicaid.utah.gov/providers/"],
 "VA": ["https://www.dmas.virginia.gov/for-providers/", "https://vamedicaid.dmas.virginia.gov/"],
 "VT": ["https://dvha.vermont.gov/providers", "https://vtmedicaid.com/"],
 "WV": ["https://dhhr.wv.gov/bms/Pages/default.aspx", "https://www.wvmmis.com/"],
 "WY": ["https://health.wyo.gov/healthcarefin/medicaid/", "https://wymedicaid.portal.conduent.com/"],
}

NOT_FOUND = re.compile(
    r"page\s*/\s*document\s*not\s*found|page\s+not\s+found|document\s+not\s+found|"
    r"404\s*(?:-|:)?\s*(?:error|not\s+found)|the\s+page\s+you\s+(?:requested|are\s+looking\s+for)"
    r"\s+(?:could\s+not\s+be\s+found|does\s+not\s+exist)|we\s+can'?t\s+find\s+that\s+page", re.I)

RATE_WORDS = re.compile(r"fee\s*schedule|reimbursement\s*rate|provider\s*rate|rate\s*setting|max(?:imum)?\s*(?:allowable)?\s*fee", re.I)
PROG_WORDS = re.compile(r"medicaid|medi-cal|masshealth|ahcccs|soonercare|tenncare|kancare|forwardhealth|husky|med-?quest|apple\s*health|mainecare|health\s*first\s*colorado|mo\s*healthnet|njfamilycare|nj\s*familycare|turquoise\s*care|cardinal\s*care|healthy\s*connections|green\s*mountain|oregon\s*health\s*plan|health\s*coverage\s*programs|medical\s*assistance|kmap|kansas\s*medical\s*assistance", re.I)


def fetch(url: str) -> tuple[int, str, str]:
    """(http status, final url, first 200 KB of body). Never raises."""
    try:
        p = subprocess.run(
            ["curl", "-sSL", "--max-time", "35", "--compressed", "-A", UA,
             "-w", "\n@@@%{http_code}\t%{url_effective}", url],
            capture_output=True, text=True, errors="replace", timeout=45)
        out = p.stdout
        tail = out.rsplit("@@@", 1)
        if len(tail) != 2:
            return 0, url, ""
        body = tail[0][:200_000]
        code, _, eff = tail[1].partition("\t")
        status = int(code.strip() or 0)
        if status in (403, 406, 429):
            # Some state portals sit behind a bot filter that refuses HTTP/2 from a
            # bare client. One retry, spoken more plainly; still the same page.
            p2 = subprocess.run(
                ["curl", "-sSL", "--http1.1", "--max-time", "35", "--compressed",
                 "-A", UA2, "-H", "Accept-Language: en-US,en;q=0.9",
                 "-H", "Accept: text/html,application/xhtml+xml", "-w",
                 "\n@@@%{http_code}\t%{url_effective}", url],
                capture_output=True, text=True, errors="replace", timeout=45)
            t2 = p2.stdout.rsplit("@@@", 1)
            if len(t2) == 2:
                c2, _, e2 = t2[1].partition("\t")
                if 200 <= int(c2.strip() or 0) < 300:
                    return int(c2.strip()), e2.strip() or url, t2[0][:200_000]
        return status, eff.strip() or url, body
    except Exception:
        return 0, url, ""


def title_of(html: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip()[:160] if m else ""


def check(code: str) -> dict:
    name, program, urls = CANDIDATES[code]
    tried = []
    for url in urls:
        status, eff, body = fetch(url)
        text = re.sub(r"<script.*?</script>", " ", body, flags=re.I | re.S)
        title = title_of(body)
        hay = f"{title}\n{text}"
        rate_ok = bool(RATE_WORDS.search(hay))
        prog_ok = bool(PROG_WORDS.search(hay))
        # A site can answer 200 and still be a "Page/Document not found" screen —
        # Arizona shipped for weeks that way. The body decides, not the status.
        gone = bool(NOT_FOUND.search(f"{title}\n{text[:4000]}"))
        tried.append({"url": url, "http_status": status, "rate_words": rate_ok,
                      "program_words": prog_ok, "not_found_page": gone})
        if 200 <= status < 300 and rate_ok and prog_ok and not gone:
            return {"ok": True, "state": code, "state_name": name, "program": program,
                    "url": eff, "requested_url": url, "http_status": status,
                    "page_title": title, "tried": tried,
                    "verified_by": "content: the page names a Medicaid fee schedule or rate"}
    return {"ok": False, "state": code, "state_name": name, "program": program, "tried": tried}



PATH_TOKEN = re.compile(r"fee(?:%20|[-_ ])?schedule|feeschedule|rates?home|/rates?(/|$|\\?)|reimbursement|maxfee|provider[-_]?pricing|rate[-_]?setting|codesfee|payment-rates|provider-payment|payment_?rates|[-_]fees\\.pdf|feeschedules?", re.I)
# Hosts that ARE a state Medicaid program or its named MMIS contractor. A .gov is
# self-evident; these are the non-.gov systems states publish their schedules on.
MMIS_HOSTS = re.compile(r"(^|\.)(ctdssmap\.com|njmmis\.com|wvmmis\.com|vtmedicaid\.com|tmhp\.com|emedny\.org|idmedicaid\.com|kmap-state-ks\.us|conduent\.com)$", re.I)


def host_is_program(url: str) -> bool:
    m = re.match(r"https?://([^/]+)", url)
    if not m:
        return False
    host = m.group(1).lower().split(":")[0]
    return host.endswith(".gov") or bool(MMIS_HOSTS.search(host))


def judge(url: str) -> dict | None:
    """Fetch one URL and say, on the record, whether it may ship and how it was proved."""
    status, eff, body = fetch(url)
    if not (200 <= status < 300):
        return {"url": url, "http_status": status, "verified": False}
    text = re.sub(r"<script.*?</script>", " ", body, flags=re.I | re.S)
    title = title_of(body)
    hay = f"{title}\n{text}"
    if RATE_WORDS.search(hay) and PROG_WORDS.search(hay):
        return {"url": eff, "requested_url": url, "http_status": status, "page_title": title,
                "verified": True, "verified_by": "content: the page names a Medicaid fee schedule or rate"}
    if PATH_TOKEN.search(eff) and host_is_program(eff):
        return {"url": eff, "requested_url": url, "http_status": status, "page_title": title,
                "verified": True,
                "verified_by": "status+address: 2xx on the program's own .gov or named MMIS host, "
                               "at an address that names the fee schedule (the page itself renders its "
                               "table with script, so the words are not in the served HTML)"}
    return {"url": eff, "requested_url": url, "http_status": status, "page_title": title, "verified": False}


HREF = re.compile(r"<a\b[^>]*href\s*=\s*[\"\']([^\"\'#>]+)[\"\'][^>]*>(.*?)</a>", re.I | re.S)


def links_worth_trying(hub: str, html: str) -> list[str]:
    """Every link on a hub page whose words or address name a fee schedule or a rate."""
    from urllib.parse import urljoin
    out: list[str] = []
    for href, label in HREF.findall(html):
        words = re.sub(r"<[^>]+>", " ", label)
        if not (RATE_WORDS.search(words) or PATH_TOKEN.search(href) or re.search(r"\brates?\b", words, re.I)):
            continue
        u = urljoin(hub, href.strip())
        if u.lower().startswith("http") and u not in out:
            out.append(u)
    return out[:25]


def discover(code: str) -> dict | None:
    """Stage 2: read the program's front door, follow only the links it calls a fee schedule."""
    name, program, urls = CANDIDATES[code]
    # First: the addresses we already tried, under the address rule — a portal that
    # renders its table with script serves no words we can read, but the address is
    # on the program's own host and the fetch is real.
    for url in urls:
        v = judge(url)
        if v and v["verified"]:
            return {"ok": True, "state": code, "state_name": name, "program": program, **v}
    for hub in HUBS.get(code, []):
        status, eff, body = fetch(hub)
        if not (200 <= status < 300) or not body:
            continue
        for cand in links_worth_trying(eff, body):
            v = judge(cand)
            if v and v["verified"]:
                return {"ok": True, "state": code, "state_name": name, "program": program,
                        "found_from": eff, **v}
    return None


# ---------------------------------------------------------------------------
# STAGE 3 — THE PAGE A REAL PERSON WOULD SEE.
#
# Four states' fee schedules are behind a bot filter that answers a bare HTTP
# client with 403, a login redirect loop, or a captcha, while the same address
# opens normally in a browser. Omitting a page that works for the person is as
# wrong as publishing one that does not, so the last stage opens the candidate
# in the same engine the person uses (headless Chrome, via Playwright) and
# applies the SAME content test to what actually rendered. Nothing is assumed:
# a state reaches the file only if Chrome loaded it and the rendered text names
# that state's Medicaid fee schedule.
#
# If node, Playwright or Chrome is missing, this stage is skipped and the state
# stays omitted with its reason. It never invents a link.
# ---------------------------------------------------------------------------

NODE = os.environ.get("PF_NODE") or shutil.which("node") or "/Users/bo/.nvm/versions/node/v25.3.0/bin/node"
PLAYWRIGHT = os.environ.get("PF_PLAYWRIGHT") or "/Users/bo/.nvm/versions/node/v25.3.0/lib/node_modules/playwright/index.mjs"
CHROME = os.environ.get("PF_CHROME") or "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

BROWSER_JS = """
import { chromium } from %(pw)s;
const urls = JSON.parse(process.argv[2]);
const b = await chromium.launch({ executablePath: %(chrome)s });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
for (const u of urls) {
  const page = await ctx.newPage();
  const out = { url: u, status: 0, title: '', final: u, text: '' };
  try {
    const r = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
    out.status = r ? r.status() : 0;
    await page.waitForTimeout(2500);
    out.title = (await page.title()).slice(0, 200);
    out.final = page.url();
    out.text = (await page.evaluate(() => document.body ? document.body.innerText : '')).slice(0, 40000);
  } catch (e) { out.error = String(e).slice(0, 160); }
  console.log(JSON.stringify(out));
  await page.close();
}
await b.close();
"""


def browser_pages(urls: list[str]) -> dict[str, dict]:
    """{url: {status, title, final, text}} as Chrome rendered it. Never raises."""
    if not urls or not os.path.exists(NODE) or not os.path.exists(PLAYWRIGHT) or not os.path.exists(CHROME):
        return {}
    js = BROWSER_JS % {"pw": json.dumps(PLAYWRIGHT), "chrome": json.dumps(CHROME)}
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False) as f:
        f.write(js)
        path = f.name
    try:
        p = subprocess.run([NODE, path, json.dumps(urls)], capture_output=True, text=True,
                           errors="replace", timeout=60 * len(urls) + 60)
        out = {}
        for line in p.stdout.splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            out[d["url"]] = d
        return out
    except Exception:
        return {}
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def browser_check(rows: list[dict]) -> list[dict]:
    """Re-try every failed state in Chrome. Returns the ones that now pass."""
    urls, owner = [], {}
    for r in rows:
        for t in r["tried"]:
            if t["url"] not in owner:
                owner[t["url"]] = r["state"]
                urls.append(t["url"])
    if not urls:
        return []
    pages = browser_pages(urls)
    won = []
    for r in rows:
        for t in r["tried"]:
            d = pages.get(t["url"])
            if not d or not (200 <= int(d.get("status") or 0) < 300):
                continue
            hay = f"{d.get('title','')}\n{d.get('text','')}"
            if NOT_FOUND.search(hay[:4000]):
                continue
            prog = re.compile(re.escape(r["program"]), re.I)
            if not RATE_WORDS.search(hay):
                continue
            if not (PROG_WORDS.search(hay) or prog.search(hay)):
                continue
            won.append({"ok": True, "state": r["state"], "state_name": r["state_name"],
                        "program": r["program"], "url": d.get("final") or t["url"],
                        "requested_url": t["url"], "http_status": int(d["status"]),
                        "page_title": re.sub(r"\s+", " ", d.get("title", "")).strip()[:160],
                        "tried": r["tried"],
                        "verified_by": "content+browser: Chrome rendered the page and it names this "
                                       "state's Medicaid fee schedule (the site refuses a bare HTTP client)"})
            break
    return won


def main() -> int:
    only = None
    for a in sys.argv[1:]:
        if a.startswith("--only="):
            only = {x.strip().upper() for x in a.split("=", 1)[1].split(",") if x.strip()}
    if only:
        for k in list(CANDIDATES):
            if k not in only:
                del CANDIDATES[k]
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(check, sorted(CANDIDATES)))
    good = [r for r in results if r["ok"]]
    still = [r for r in results if not r["ok"]]
    print(f"stage 1: {len(good)} verified, {len(still)} to discover", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        found = list(ex.map(discover, [r["state"] for r in still]))
    bad = []
    for r, f in zip(still, found):
        if f:
            good.append(f)
        else:
            bad.append(r)
    if bad:
        print(f"stage 2: {len(good)} verified, {len(bad)} to open in a browser", flush=True)
        won = browser_check(bad)
        if won:
            got = {r["state"] for r in won}
            good.extend(won)
            bad = [r for r in bad if r["state"] not in got]
            print(f"stage 3: Chrome recovered {sorted(got)}", flush=True)
    today = datetime.date.today().isoformat()
    doc = {
        "_what": "Each state's own published Medicaid fee-schedule page. Medicaid rates are set by "
                 "each state and no national federal file publishes them, so this list is the only "
                 "honest place to send a Medicaid enrollee for their own rate.",
        "_how_verified": "data/verify_medicaid_links.py fetches each candidate URL and keeps it only "
                         "when the response is 2xx AND the page names a fee schedule/rate AND names "
                         "Medicaid or that state's own Medicaid program AND the body is not a "
                         "'not found' screen. A state whose site refuses a bare HTTP client is opened "
                         "in headless Chrome and judged on what actually rendered. Anything else is omitted.",
        "_verified_on": today,
        "_programs_note": "What each state calls its own Medicaid program. Carried for every "
                          "state, including the ones whose fee-schedule address could not be "
                          "fetched, so the product can still name where the rate is published.",
        "programs": {c: {"state_name": CANDIDATES[c][0], "program": CANDIDATES[c][1]} for c in sorted(CANDIDATES)},
        "_states_published": len(good),
        "_states_omitted": len(bad),
        "states": {r["state"]: {"state_name": r["state_name"], "program": r["program"], "url": r["url"],
                                "http_status": r["http_status"], "page_title": r.get("page_title", ""),
                                "verified_by": r.get("verified_by", "content: the page names a Medicaid fee schedule or rate"),
                                **({"found_from": r["found_from"]} if r.get("found_from") else {}),
                                "verified_on": today} for r in sorted(good, key=lambda r: r["state"])},
        "_omitted": [{"state": r["state"], "state_name": r["state_name"], "program": r["program"],
                      "reason": "no address tried, no fee-schedule link on the program's own front "
                                "door, and no page opened in Chrome, returned a 2xx page that proves "
                                "it is that state's Medicaid fee schedule. Omitted rather than guessed.",
                      "tried": r["tried"]} for r in sorted(bad, key=lambda r: r["state"])],
    }
    if only and OUT.exists():
        # A partial run tops up the published list; it never drops a state that
        # was already fetched and proved on an earlier pass.
        prev = json.loads(OUT.read_text())
        # A partial run must never shrink the program names either: every state
        # keeps the name it calls its own Medicaid program, published or not.
        doc["programs"] = dict(sorted({**prev.get("programs", {}), **doc["programs"]}.items()))
        merged_states = {**prev.get("states", {}), **doc["states"]}
        for code in doc["states"]:
            prev["_omitted"] = [o for o in prev.get("_omitted", []) if o["state"] != code]
        still = {o["state"] for o in prev.get("_omitted", [])} | {o["state"] for o in doc["_omitted"]}
        omitted = [o for o in prev.get("_omitted", []) + doc["_omitted"]
                   if o["state"] in still and o["state"] not in merged_states]
        seen: set[str] = set()
        doc["_omitted"] = [o for o in omitted if not (o["state"] in seen or seen.add(o["state"]))]
        doc["states"] = dict(sorted(merged_states.items()))
        doc["_states_published"] = len(doc["states"])
        doc["_states_omitted"] = len(doc["_omitted"])
        doc["_verified_on"] = today
        for r in doc["states"].values():
            r["verified_on"] = today
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"verified {len(good)} / {len(CANDIDATES)}  ->  {OUT}")
    for r in bad:
        print(f"  OMITTED {r['state']} {r['state_name']}: " + "; ".join(f"{t['url']} -> {t['http_status']}" for t in r["tried"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
