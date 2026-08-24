# -*- coding: utf-8 -*-
"""PPTX 를 PowerPoint 로 PDF 변환한 뒤 이미지로 떠서 배치를 눈으로 검증한다."""
import os
import sys

PPTX = r"C:\Claude\poster-editable\out\poster-editable.pptx"
TMP = r"C:\Users\User\AppData\Local\Temp\claude\C--Claude\30a3b719-66dd-437d-9ac2-113f87bb4d5c\scratchpad"
PDF = os.path.join(TMP, "pptx_check.pdf")
PNG = os.path.join(TMP, "pptx_check.png")

PP_SAVE_AS_PDF = 32


def export(pptx=PPTX, pdf=PDF):
    import win32com.client
    app = None
    pres = None
    try:
        app = win32com.client.Dispatch("PowerPoint.Application")
        pres = app.Presentations.Open(pptx, ReadOnly=True, WithWindow=False)
        if os.path.exists(pdf):
            os.remove(pdf)
        pres.SaveAs(pdf, PP_SAVE_AS_PDF)
        return pdf
    finally:
        try:
            if pres is not None:
                pres.Close()
        except Exception:
            pass
        try:
            if app is not None:
                app.Quit()
        except Exception:
            pass


def raster(pdf=PDF, png=PNG, dpi=170):
    import pymupdf
    d = pymupdf.open(pdf)
    pix = d[0].get_pixmap(dpi=dpi)
    pix.save(png)
    print("pptx 렌더 -> %s  %dx%d  (pdf 페이지 %d)" % (png, pix.width, pix.height, len(d)))
    d.close()
    return png


if __name__ == "__main__":
    p = export()
    print("PDF 변환 완료:", p, "%.0f KB" % (os.path.getsize(p) / 1024))
    raster(p)
