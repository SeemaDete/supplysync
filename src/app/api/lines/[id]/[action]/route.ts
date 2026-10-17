import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/session";
import {
  deliveryInput, dispatchInput, grInput, overrideInput, responseInput, supplierConfirmInput, supplierReviseInput,
} from "@/lib/validation";
import { supplierConfirm, supplierRevise, updateDispatch, recordResponse } from "@/services/response-service";
import { recordDelivery, postGoodsReceipt } from "@/services/delivery-service";
import { applyOverride } from "@/services/override-service";

type P = { id: string; action: string };

/**
 * POST /api/lines/:id/confirm   – supplier confirms delivery date
 * POST /api/lines/:id/revise    – supplier revises delivery date (delay reason required)
 * POST /api/lines/:id/dispatch  – supplier updates dispatched quantity
 * POST /api/lines/:id/response  – buyer records a supplier response
 * POST /api/lines/:id/delivery  – logistics records a (partial) delivery
 * POST /api/lines/:id/gr        – stores posts a goods receipt
 * POST /api/lines/:id/override  – authorised manual correction (audited)
 */
export const POST = withApi<P>(async (req, { params }) => {
  const { id, action } = await params;
  const body = { ...(await readJson<Record<string, unknown>>(req)), lineId: id };

  switch (action) {
    case "confirm": {
      const user = await requireApiUser();
      if (!["SUPPLIER", "BUYER", "ADMIN"].includes(user.role)) throw new HttpError(403, "Not allowed");
      const i = supplierConfirmInput.parse(body);
      return supplierConfirm(user, id, i.confirmedDate, i.remarks);
    }
    case "revise": {
      const user = await requireApiUser();
      if (!["SUPPLIER", "BUYER", "ADMIN"].includes(user.role)) throw new HttpError(403, "Not allowed");
      const i = supplierReviseInput.parse(body);
      return supplierRevise(user, id, i.revisedDate, i.delayReason, i.remarks);
    }
    case "dispatch": {
      const user = await requireApiUser();
      if (!["SUPPLIER", "ADMIN"].includes(user.role)) throw new HttpError(403, "Only the supplier updates dispatch quantity");
      const i = dispatchInput.parse(body);
      return updateDispatch(user, id, i.dispatchedQty, i.remarks);
    }
    case "response": {
      const user = await requireApiUser("response:record");
      const i = responseInput.parse(body);
      return recordResponse(user, { ...i, lineId: id });
    }
    case "delivery": {
      const user = await requireApiUser("delivery:record");
      const i = deliveryInput.parse(body);
      return recordDelivery(user, i, Boolean(body.allowOverDelivery) && user.role === "ADMIN");
    }
    case "gr": {
      const user = await requireApiUser("gr:post");
      const i = grInput.parse(body);
      return postGoodsReceipt(user, i);
    }
    case "override": {
      const user = await requireApiUser("override:apply");
      const i = overrideInput.parse(body);
      return applyOverride(user, i);
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  }
});
