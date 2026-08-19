from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.enums import TA_CENTER, TA_RIGHT


def generate_order_pdf(order):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm,
                            leftMargin=20*mm, rightMargin=20*mm)
    styles = getSampleStyleSheet()
    story = []

    # Header
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], alignment=TA_CENTER,
                                  fontSize=18, textColor=colors.HexColor('#1e40af'))
    story.append(Paragraph("GLASS ORDER MANAGEMENT SYSTEM", title_style))
    story.append(Paragraph("ORDER ACKNOWLEDGMENT", ParagraphStyle('Sub', parent=styles['Normal'],
                            alignment=TA_CENTER, fontSize=12, textColor=colors.grey)))
    story.append(Spacer(1, 6*mm))

    # Order Info Table
    info_data = [
        ['Order Number:', order.order_number, 'Order Date:', str(order.order_date.strftime('%d %b %Y'))],
        ['Customer:', order.customer.company_name, 'Delivery Deadline:', str(order.delivery_deadline.strftime('%d %b %Y'))],
        ['Status:', order.get_status_display(), 'Rush Order:', 'YES ⚡' if order.rush_flag else 'No'],
    ]
    info_table = Table(info_data, colWidths=[40*mm, 65*mm, 40*mm, 45*mm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0f4ff')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 6*mm))

    # Items Table
    story.append(Paragraph("Order Items", styles['Heading3']))
    story.append(Spacer(1, 2*mm))

    headers = ['#', 'Glass Type', 'Thick.', 'W×H (mm)', 'Qty', 'Rough Cut', 'Tempered', 'SQM', 'Line Total']
    rows = [headers]

    for i, item in enumerate(order.items.all(), 1):
        rows.append([
            str(i),
            item.catalog.name,
            f"{item.thickness_mm}mm",
            f"{item.width_mm}×{item.height_mm}",
            str(item.quantity),
            f"{item.rough_width_mm}×{item.rough_height_mm}",
            'Yes' if item.tempering_required else 'No',
            f"{float(item.finished_sqm):.3f}",
            f"ETB {float(item.line_total_price):,.2f}",
        ])

    item_table = Table(rows, colWidths=[8*mm, 35*mm, 14*mm, 24*mm, 10*mm, 26*mm, 18*mm, 16*mm, 28*mm])
    item_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8faff')]),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ('ALIGN', (4, 0), (-1, -1), 'CENTER'),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(item_table)
    story.append(Spacer(1, 6*mm))

    # Pricing Summary
    summary_data = [
        ['Subtotal (Material + Cutting):', f"ETB {float(order.subtotal):,.2f}"],
        ['Tempering Charges:', f"ETB {float(order.tempering_charge):,.2f}"],
    ]
    if order.rush_flag:
        summary_data.append(['Rush Surcharge (25%):', f"ETB {float(order.rush_charge):,.2f}"])
    summary_data.append(['Tax (15%):', f"ETB {float(order.tax_amount):,.2f}"])
    summary_data.append(['TOTAL:', f"ETB {float(order.total_price):,.2f}"])

    summary_table = Table(summary_data, colWidths=[120*mm, 50*mm])
    summary_style = [
        ('FONTNAME', (0, 0), (-1, -2), 'Helvetica'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('LINEABOVE', (0, -1), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, -1), (-1, -1), 12),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]
    if order.rush_flag:
        summary_style.append(('TEXTCOLOR', (0, 2), (-1, 2), colors.red))
    summary_table.setStyle(TableStyle(summary_style))
    story.append(summary_table)

    story.append(Spacer(1, 10*mm))
    story.append(Paragraph("Customer Signature: ____________________________    Date: ____________",
                            styles['Normal']))
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("This document serves as an official order acknowledgment.",
                            ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8,
                                           textColor=colors.grey, alignment=TA_CENTER)))

    doc.build(story)
    buffer.seek(0)
    return buffer
