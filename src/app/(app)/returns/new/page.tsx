import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ReturnForm } from "@/components/return-form";
import { PageHeader } from "@/components/ui";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function NewReturnPage(props: PageProps<"/returns/new">) {
  const query = await props.searchParams;
  const direction = first(query.direction) === "supplier" ? "supplier" : "customer";

  return (
    <>
      <PageHeader
        title="اذن ارتجاع جديد"
        subtitle="الارتجاع مربوط بالفاتورة الأصلية — مرتجع العميل يتطلب رقم الفاتورة ورقم البيان"
        actions={
          <Link href="/returns" className="btn-ghost">
            <ArrowRight size={16} />
            رجوع
          </Link>
        }
      />
      <ReturnForm
        initialDirection={direction}
        initialInvoiceNumber={first(query.invoice)}
        initialStatementNumber={first(query.statement)}
      />
    </>
  );
}
