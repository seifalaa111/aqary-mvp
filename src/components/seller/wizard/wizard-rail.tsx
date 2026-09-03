"use client";

import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/primitives";

/**
 * The persistent "what we do with this" explainer. Sellers are handing over a
 * national ID and a full payment history; the rail says, at every step, exactly
 * why we need it and who will see it.
 */
const COPY: Record<number, { en: [string, string][]; ar: [string, string][] }> = {
  1: {
    en: [
      ["Why we need your ID", "The developer will only process an assignment for the person named on the contract. We check that the name on your ID matches it before we spend anyone's time."],
      ["Who sees it", "Only Aqary's verification analysts. It is never shown to buyers, and personal data is redacted from anything a buyer can open."],
      ["If you are not the owner", "An heir or a representative can list, but we will need the power of attorney (توكيل) or the inheritance document."],
    ],
    ar: [
      ["لماذا نحتاج بطاقتك", "المطوّر لا ينفّذ التنازل إلا للشخص المذكور في العقد. نتأكد من تطابق الاسم قبل أن نبدأ الإجراءات."],
      ["من يطّلع عليها", "محللو التوثيق في أقاري فقط. لا تُعرض للمشترين، والبيانات الشخصية محجوبة في أي مستند يفتحه المشتري."],
      ["إذا لم تكن المالك", "يمكن للوريث أو الوكيل الإدراج، لكننا سنحتاج التوكيل أو إعلام الوراثة."],
    ],
  },
  2: {
    en: [
      ["Why the unit code matters", "It is how the developer finds your file. Copy it exactly as printed on the contract, including any letters."],
      ["Delivery date", "Buyers filter on this more than almost anything else. Use the contractual date, not what you have been told verbally."],
      ["We check this against the contract", "If what you enter here disagrees with the document, we raise it with you before an analyst sees it."],
    ],
    ar: [
      ["أهمية كود الوحدة", "به يجد المطوّر ملفك. انسخه كما هو مطبوع في العقد بالحروف والأرقام."],
      ["تاريخ التسليم", "المشترون يبحثون به أكثر من أي شيء آخر. استخدم التاريخ التعاقدي وليس ما قيل لك شفهيًا."],
      ["نطابق هذا مع العقد", "إذا اختلف ما تدخله عن المستند، ننبّهك قبل أن يصل الملف إلى المحلل."],
    ],
  },
  3: {
    en: [
      ["This is the heart of the file", "Everything you enter here is recorded as YOUR statement. It is never shown to a buyer as fact until an analyst has confirmed it against your documents."],
      ["What you get back", "Your cash figure is the amount you have paid — nothing more, nothing less. That is the whole model: no overprice."],
      ["If you are unsure", "Enter your best figure. The extraction engine reads the contract and the receipts, and we show you where the two disagree."],
    ],
    ar: [
      ["هذا قلب الملف", "كل ما تدخله هنا يُسجَّل بوصفه إقرارك أنت. ولا يُعرض للمشتري كحقيقة إلا بعد أن يطابقه المحلل مع مستنداتك."],
      ["ماذا تستلم", "مبلغك النقدي هو ما دفعته بالضبط — لا أكثر ولا أقل. هذا هو النموذج كله: بدون أوفر."],
      ["إن لم تكن متأكدًا", "أدخل أقرب رقم لديك. محرك الاستخراج يقرأ العقد والإيصالات، ونعرض لك مواضع الاختلاف."],
    ],
  },
  4: {
    en: [
      ["The account statement is the shortcut", "One recent developer account statement (كشف حساب) confirms your paid total and your balance in a single document. It is the fastest way to a high verification score."],
      ["All receipts, not the best ones", "Gaps in the receipt trail are the single most common reason a file sits waiting."],
      ["Photographs sell the unit", "Buyers scroll past listings without them. If the unit is not delivered yet, show the project and the show unit — we label them honestly so nobody is misled."],
    ],
    ar: [
      ["كشف الحساب هو الطريق الأسرع", "كشف حساب حديث من المطوّر يؤكد إجمالي المسدد والرصيد في مستند واحد، ويرفع درجة التوثيق بسرعة."],
      ["كل الإيصالات وليس أفضلها", "النقص في سلسلة الإيصالات هو أكثر سبب يؤخّر الملفات."],
      ["الصور هي ما يبيع الوحدة", "المشترون يتجاوزون الإعلانات بدون صور. وإذا لم تُستلم الوحدة بعد، اعرض المشروع ووحدة العرض — ونحن نوضّح ذلك بصدق."],
    ],
  },
  5: {
    en: [
      ["Your cash figure is fixed", "It equals what you have verifiably paid. You may offer to go below it to close faster; you can never go above it."],
      ["Why we ask your reason for exiting", "It is structured data, kept private, and it is what lets us tell developers where distress is building before it becomes a default."],
      ["A private listing", "If you would rather your unit did not appear publicly, choose a private listing: only matched, verified buyers see it."],
    ],
    ar: [
      ["مبلغك النقدي ثابت", "يساوي ما دفعته وتم توثيقه. يمكنك عرض النزول عنه للإسراع بالبيع، ولا يمكنك تجاوزه أبدًا."],
      ["لماذا نسأل عن سبب الخروج", "بيانات منظمة تبقى سرية، وهي ما يسمح لنا بتنبيه المطوّرين إلى التعثر قبل حدوثه."],
      ["الإدراج الخاص", "إن كنت تفضّل ألا تظهر وحدتك علنًا، اختر الإدراج الخاص: يراها فقط المشترون الموثّقون المطابقون."],
    ],
  },
  6: {
    en: [
      ["What happens next", "The extraction engine reads your file, rebuilds your payment schedule and reconciles it against your receipts. You confirm the summary, then a human analyst signs off every figure."],
      ["Nothing publishes automatically", "AI output can never become a verified number on its own. A named analyst promotes each value, and their name is on the record."],
      ["Typical timing", "One to two working days once your documents are complete."],
    ],
    ar: [
      ["ماذا يحدث بعد ذلك", "يقرأ محرك الاستخراج ملفك، ويعيد بناء جدول السداد، ويطابقه مع إيصالاتك. تؤكد أنت الملخّص، ثم يعتمد محلل بشري كل رقم."],
      ["لا شيء يُنشر تلقائيًا", "لا يمكن لمخرجات الذكاء الاصطناعي أن تصبح رقمًا موثّقًا من تلقاء نفسها. يعتمد كل قيمة محلل باسمه، ويُسجَّل ذلك."],
      ["المدة المعتادة", "يوم إلى يومي عمل بعد اكتمال مستنداتك."],
    ],
  },
};

export function WizardRail({ step, locale }: { step: number; locale: string }) {
  const t = useTranslations("seller");
  const entries = (locale === "ar" ? COPY[step]?.ar : COPY[step]?.en) ?? [];

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="rounded-lg border border-rule bg-paper-sunken/60 p-5">
        <Eyebrow>{t("railTitle")}</Eyebrow>
        <ul className="mt-4 flex flex-col gap-5">
          {entries.map(([title, body]) => (
            <li key={title}>
              <p className="mb-1 text-sm font-semibold text-ink">{title}</p>
              <p className="text-xs leading-relaxed text-ink-70">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
