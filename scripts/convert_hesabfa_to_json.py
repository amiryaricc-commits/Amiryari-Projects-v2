import argparse
import json
import math
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NAMESPACES = {"m": MAIN_NS, "r": REL_NS}


def column_index(reference):
    letters = re.match(r"[A-Z]+", reference)
    if not letters:
        raise ValueError(f"Invalid cell reference: {reference}")
    result = 0
    for char in letters.group(0):
        result = result * 26 + ord(char) - ord("A") + 1
    return result - 1


def read_first_sheet(path):
    with zipfile.ZipFile(path) as workbook:
        members = set(workbook.namelist())
        shared_strings = []
        if "xl/sharedStrings.xml" in members:
            shared_root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(text.text or "" for text in item.findall(".//m:t", NAMESPACES))
                for item in shared_root.findall("m:si", NAMESPACES)
            ]

        workbook_root = ElementTree.fromstring(workbook.read("xl/workbook.xml"))
        sheet = workbook_root.find("m:sheets/m:sheet", NAMESPACES)
        if sheet is None:
            raise ValueError(f"No worksheet found in {path.name}")
        relationship_id = sheet.attrib[f"{{{REL_NS}}}id"]
        relationship_root = ElementTree.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        target = next(
            relationship.attrib["Target"]
            for relationship in relationship_root.findall(f"{{{PKG_REL_NS}}}Relationship")
            if relationship.attrib["Id"] == relationship_id
        )
        sheet_path = posixpath.normpath(posixpath.join("xl", target))
        root = ElementTree.fromstring(workbook.read(sheet_path))
        rows = []
        for row in root.findall(".//m:sheetData/m:row", NAMESPACES):
            cells = {}
            for cell in row.findall("m:c", NAMESPACES):
                value = cell.find("m:v", NAMESPACES)
                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    parsed = "".join(
                        text.text or "" for text in cell.findall(".//m:t", NAMESPACES)
                    )
                elif value is None:
                    parsed = ""
                elif cell_type == "s":
                    parsed = shared_strings[int(value.text)]
                else:
                    parsed = value.text or ""
                cells[column_index(cell.attrib["r"])] = parsed
            if cells:
                rows.append([cells.get(index, "") for index in range(max(cells) + 1)])

    if not rows:
        raise ValueError(f"No rows found in {path.name}")
    headers = [str(value).strip() for value in rows[0]]
    records = []
    for row in rows[1:]:
        records.append(
            {
                header: row[index] if index < len(row) else ""
                for index, header in enumerate(headers)
                if header
            }
        )
    return records


def text(value):
    return str(value or "").strip()


def amount(value, field_name):
    try:
        parsed = float(str(value).replace(",", "").strip() or "0")
    except ValueError as error:
        raise ValueError(f"Invalid amount in {field_name}: {value}") from error
    if not math.isfinite(parsed):
        raise ValueError(f"Invalid amount in {field_name}: {value}")
    return int(parsed) if parsed.is_integer() else parsed


def category_for(source_category):
    category = source_category.casefold()
    if "جویس" in category or "سالت" in category:
        return "جویس و سالت"
    if "کویل" in category or "کارتریج" in category:
        return "کویل و کارتریج"
    if "پاد" in category or "دیسپوزبل" in category or "دستگاه" in category:
        return "دستگاه پاد و ماد"
    if "باندل" in category or "پکیج" in category:
        return "پکیج باندل"
    if "کارت هدیه" in category or "خدمات" in category:
        return "کارت هدیه و خدمات"
    return "سایر کالاها"


def build_payload(contacts_path, products_path, invoices_path):
    contact_rows = read_first_sheet(contacts_path)
    product_rows = read_first_sheet(products_path)
    invoice_rows = read_first_sheet(invoices_path)

    contacts = []
    for row in contact_rows:
        source_code = text(row.get("کد شخص"))
        full_name = text(row.get("نام شخص"))
        if not source_code or not full_name:
            raise ValueError("A contact is missing its source code or name.")
        contacts.append(
            {
                "id": f"hesabfa-contact-{source_code}",
                "sourceCode": source_code,
                "fullName": full_name,
                "personType": text(row.get("نوع")),
                "role": text(row.get("نقش")),
                "phone": text(row.get("شماره موبایل")),
                "notes": text(row.get("توضیحات")),
            }
        )
    if len({contact["sourceCode"] for contact in contacts}) != len(contacts):
        raise ValueError("Duplicate contact codes found.")

    products = []
    product_codes = set()
    for row in product_rows:
        sku = text(row.get("کد کالا"))
        name = text(row.get("عنوان کالا"))
        if not sku or not name or sku in product_codes:
            raise ValueError(f"Missing or duplicate product code: {sku}")
        product_codes.add(sku)
        source_category = text(row.get("دسته‌بندی"))
        source_status = text(row.get("وضعیت کالا"))
        stock_qty = amount(row.get("موجودی اول دوره"), "موجودی کالا")
        if stock_qty < 0 or not float(stock_qty).is_integer():
            raise ValueError(f"Invalid stock quantity for {sku}")
        products.append(
            {
                "id": f"hesabfa-item-{sku}",
                "sku": sku,
                "name": name,
                "category": category_for(source_category),
                "brand": "",
                "uomPrimary": text(row.get("واحد سنجش")) or "عدد",
                "stockQty": int(stock_qty),
                "reservedQty": 0,
                "reorderLevel": 0,
                "valuationRate": amount(row.get("قیمت خرید پیش‌فرض"), "قیمت خرید پیش‌فرض"),
                "retailPrice": amount(row.get("قیمت فروش"), "قیمت فروش"),
                "wholesalePrice": 0,
                "partnerPrice": 0,
                "serialNumbers": [],
                "batchNo": "",
                "expiryDate": "",
                "sourceCategory": source_category,
                "sourceStatus": source_status,
            }
        )

    sales_by_number = {}
    held_invoice_numbers = []
    corrections = [
        "فاکتور ۱۳۶: مبلغ پرداختی از ۹٬۵۰۰٬۰۰۰ به ۹۵۰٬۰۰۰ تومان مطابق جمع فاکتور اصلاح شد.",
        "فاکتور ۱۲۹ به‌دلیل کد کالای نامشخص PRD-0001 از ورود کنار گذاشته شد تا کالا تعیین شود.",
        "قیمت فروش، مانده و موجودی مطابق فایل‌های منبع حفظ شده‌اند؛ فاکتورهای تاریخی سند حسابداری یا گردش انبار ایجاد نمی‌کنند.",
    ]
    for row in invoice_rows:
        invoice_number = text(row.get("شماره فاکتور"))
        if not invoice_number:
            raise ValueError("An invoice is missing its invoice number.")
        if invoice_number == "129":
            if invoice_number not in held_invoice_numbers:
                held_invoice_numbers.append(invoice_number)
            continue
        sku = text(row.get("کد کالا"))
        if sku not in product_codes:
            raise ValueError(f"Invoice {invoice_number} refers to unknown SKU {sku}.")
        total = amount(row.get("مبلغ کل (تومان)"), "مبلغ کل")
        paid = amount(row.get("مبلغ پرداختی"), "مبلغ پرداختی")
        status = text(row.get("وضعیت فاکتور"))
        if invoice_number == "136":
            paid = 950000
        if invoice_number in sales_by_number:
            raise ValueError(
                f"Invoice {invoice_number} has multiple lines; manual line grouping is required."
            )
        draft = status == "پیش‌نویس"
        normalized_status = (
            "پیش‌نویس"
            if draft
            else "پرداخت‌شده"
            if paid >= total
            else "معوق"
            if paid == 0
            else "اقساطی فعال"
        )
        sales_by_number[invoice_number] = {
            "id": f"hesabfa-invoice-{invoice_number}",
            "invoiceNo": invoice_number,
            "docstatus": 0 if draft else 1,
            "isHistoricalArchive": True,
            "archiveNote": "بایگانی تاریخی حسابفا؛ بدون اثر بر دفتر کل، دریافت، برگشت یا موجودی.",
            "sourceStatus": status,
            "customerName": text(row.get("نام مشتری")),
            "date": text(row.get("تاریخ فاکتور")),
            "dueDate": "",
            "branchDimension": "تعیین‌نشده",
            "channelDimension": "بایگانی تاریخی حسابفا",
            "paymentTermsTemplate": "داده‌ی تاریخی",
            "updateStock": False,
            "isSubscription": False,
            "status": normalized_status,
            "totalAmount": total,
            "paidAmount": paid,
            "cogsAmount": 0,
            "itemsSummary": text(row.get("عنوان کالا")),
            "lines": [
                {
                    "id": f"hesabfa-line-{invoice_number}-1",
                    "sku": sku,
                    "itemName": text(row.get("عنوان کالا")),
                    "uom": "عدد",
                    "qty": amount(row.get("تعداد"), "تعداد"),
                    "unitPrice": amount(row.get("قیمت واحد (تومان)"), "قیمت واحد"),
                    "discountPercent": 0,
                    "netLineAmount": total,
                    "valuationRate": 0,
                }
            ],
        }

    if not held_invoice_numbers:
        raise ValueError("Expected held invoice 129 was not found.")
    invoices = list(sales_by_number.values())
    if any(invoice["paidAmount"] > invoice["totalAmount"] for invoice in invoices):
        raise ValueError("An invoice payment exceeds its total.")

    return {
        "schemaVersion": 1,
        "inventoryBasis": "current_snapshot",
        "salesInvoiceMode": "archive_only",
        "contacts": contacts,
        "products": products,
        "salesInvoices": invoices,
        "heldInvoiceNumbers": held_invoice_numbers,
        "corrections": corrections,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Convert the three Hesabfa Excel exports to FaraPay's reviewed JSON import format."
    )
    parser.add_argument("--contacts", type=Path, required=True)
    parser.add_argument("--products", type=Path, required=True)
    parser.add_argument("--invoices", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    payload = build_payload(args.contacts, args.products, args.invoices)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Validated {len(payload['contacts'])} contacts, "
        f"{len(payload['products'])} products, "
        f"{len(payload['salesInvoices'])} invoices; "
        f"held {', '.join(payload['heldInvoiceNumbers'])}."
    )


if __name__ == "__main__":
    main()
