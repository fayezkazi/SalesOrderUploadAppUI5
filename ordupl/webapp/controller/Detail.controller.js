sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel",
    "zsd/ordupl/model/formatter"
], function (Controller, MessageToast, MessageBox, JSONModel, formatter) {
    "use strict";

    return Controller.extend("zsd.ordupl.controller.Detail", {

        formatter: formatter,

        onInit: function () {
            this.getView().setModel(new JSONModel({ editMode: false, item: {}, itemIndex: -1 }), "detail");
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var iIndex = parseInt(oEvent.getParameter("arguments").itemIndex, 10);
            var oResultsModel = this.getOwnerComponent().getModel("results");
            var aItems = oResultsModel.getProperty("/items");
            var oItem = aItems[iIndex];

            if (!oItem) {
                MessageToast.show("Record not found.");
                this.onNavBack();
                return;
            }

            var oDetailModel = this.getView().getModel("detail");
            var oItemCopy = JSON.parse(JSON.stringify(oItem));
            oItemCopy.Bstdk = this._toYYYYMMDD(oItemCopy.Bstdk);
            oItemCopy.Vdatu = this._toYYYYMMDD(oItemCopy.Vdatu);
            oDetailModel.setProperty("/editMode", false);
            oDetailModel.setProperty("/item", oItemCopy);
            oDetailModel.setProperty("/itemIndex", iIndex);
            this._oOriginalItem = JSON.parse(JSON.stringify(oItemCopy));
        },

        _toYYYYMMDD: function (sValue) {
            if (!sValue) { return sValue; }
            // Already YYYYMMDD (8 digits)
            if (/^\d{8}$/.test(sValue)) { return sValue; }
            // OData /Date(timestamp)/ format
            var oTickMatch = sValue.match(/\/Date\((\d+)\)\//);
            if (oTickMatch) {
                var oDate1 = new Date(parseInt(oTickMatch[1], 10));
                return String(oDate1.getUTCFullYear()) +
                    String(oDate1.getUTCMonth() + 1).padStart(2, "0") +
                    String(oDate1.getUTCDate()).padStart(2, "0");
            }
            // ISO 8601: 2026-07-13T... or 2026-07-13
            var oIsoMatch = sValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (oIsoMatch) {
                return oIsoMatch[1] + oIsoMatch[2] + oIsoMatch[3];
            }
            // MM/DD/YYYY
            var oUsMatch = sValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (oUsMatch) {
                return oUsMatch[3] + oUsMatch[1] + oUsMatch[2];
            }
            return sValue;
        },

        onNavBack: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteMain", {}, true);
        },

        onEdit: function () {
            var oItem = this.getView().getModel("detail").getProperty("/item");
            if (oItem && oItem.Status === "S") {
                MessageBox.information("The Order is already processed, change is not possible.");
                return;
            }
            this.getView().getModel("detail").setProperty("/editMode", true);
        },

        onCancelEdit: function () {
            var oDetailModel = this.getView().getModel("detail");
            oDetailModel.setProperty("/item", JSON.parse(JSON.stringify(this._oOriginalItem)));
            oDetailModel.setProperty("/editMode", false);
        },

        onSave: function () {
            var that = this;
            var oDetailModel = this.getView().getModel("detail");
            var oItem = oDetailModel.getProperty("/item");
            var sGuid = oItem.StgGuid;
            var oODataModel = this.getOwnerComponent().getModel();

            var oPayload = {
                Auart: oItem.Auart,
                Vkorg: oItem.Vkorg,
                Vtweg: oItem.Vtweg,
                Spart: oItem.Spart,
                Vkbur: oItem.Vkbur,
                KunnrAg: oItem.KunnrAg,
                KunnrWe: oItem.KunnrWe,
                Augru: oItem.Augru,
                Bstnk: oItem.Bstnk,
                Bstdk: oItem.Bstdk,
                Vdatu: oItem.Vdatu,
                Name1: oItem.Name1,
                Name2: oItem.Name2,
                Stras: oItem.Stras,
                StrSuppl: oItem.StrSuppl,
                Ort01: oItem.Ort01,
                Regio: oItem.Regio,
                Pstlz: oItem.Pstlz,
                SmtpAddr: oItem.SmtpAddr,
                Posnr: oItem.Posnr,
                Matnr: oItem.Matnr,
                Kwmeng: oItem.Kwmeng,
                Vrkme: oItem.Vrkme,
                Charg: oItem.Charg,
                Werks: oItem.Werks
            };

            oODataModel.update("/OrdersUpload(guid'" + sGuid + "')", oPayload, {
                success: function () {
                    that._oOriginalItem = JSON.parse(JSON.stringify(oItem));
                    oDetailModel.setProperty("/editMode", false);

                    // Sync update back into the results list model
                    var iIndex = oDetailModel.getProperty("/itemIndex");
                    var oResultsModel = that.getOwnerComponent().getModel("results");
                    oResultsModel.setProperty("/items/" + iIndex, oItem);

                    MessageToast.show("Record saved successfully.");
                },
                error: function (oError) {
                    var sMsg = "An error occurred while saving.";
                    if (oError.responseJSON && oError.responseJSON.error &&
                        oError.responseJSON.error.message && oError.responseJSON.error.message.value) {
                        sMsg = oError.responseJSON.error.message.value;
                    }
                    MessageBox.error(sMsg);
                }
            });
        },

        onDelete: function () {
            var that = this;
            MessageBox.confirm("Are you sure you want to delete this record?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        that._deleteRecord();
                    }
                }
            });
        },

        _deleteRecord: function () {
            var that = this;
            var oDetailModel = this.getView().getModel("detail");
            var sGuid = oDetailModel.getProperty("/item/StgGuid");
            var oODataModel = this.getOwnerComponent().getModel();

            oODataModel.remove("/OrdersUpload(guid'" + sGuid + "')", {
                success: function () {
                    var iIndex = oDetailModel.getProperty("/itemIndex");
                    var oResultsModel = that.getOwnerComponent().getModel("results");
                    var aItems = oResultsModel.getProperty("/items");
                    aItems.splice(iIndex, 1);
                    oResultsModel.setProperty("/items", aItems);

                    MessageToast.show("Record deleted.");
                    that.onNavBack();
                },
                error: function (oError) {
                    var sMsg = "An error occurred while deleting.";
                    if (oError.responseJSON && oError.responseJSON.error &&
                        oError.responseJSON.error.message && oError.responseJSON.error.message.value) {
                        sMsg = oError.responseJSON.error.message.value;
                    }
                    MessageBox.error(sMsg);
                }
            });
        }

    });
});
