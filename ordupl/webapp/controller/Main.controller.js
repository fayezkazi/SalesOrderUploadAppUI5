sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/ResizeHandler",
    "zsd/ordupl/model/formatter"
], function (Controller, MessageToast, MessageBox, JSONModel, ResizeHandler, formatter) {
    "use strict";

    return Controller.extend("zsd.ordupl.controller.Main", {

        formatter: formatter,

        onInit: function () {
            this._oFile = null;
            this._bDropEventsAttached = false;
            this._createHiddenFileInput();
            this.getOwnerComponent().setModel(new JSONModel({ items: [], hasUnprocessed: false, itemsCount: 0 }), "results");
        },

        _createHiddenFileInput: function () {
            this._oFileInput = document.createElement("input");
            this._oFileInput.type = "file";
            this._oFileInput.accept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            this._oFileInput.style.display = "none";
            this._oFileInput.addEventListener("change", this._onFileSelected.bind(this));
            document.body.appendChild(this._oFileInput);
        },

        onAfterRendering: function () {
            if (!this._bDropEventsAttached) {
                var oDomRef = this.byId("dropZone").getDomRef();
                if (oDomRef) {
                    var that = this;
                    oDomRef.addEventListener("dragover", function (oEvent) {
                        oEvent.preventDefault();
                        oEvent.stopPropagation();
                        oDomRef.classList.add("orderUploadDropZoneDragOver");
                    });
                    oDomRef.addEventListener("dragleave", function () {
                        oDomRef.classList.remove("orderUploadDropZoneDragOver");
                    });
                    oDomRef.addEventListener("drop", function (oEvent) {
                        oEvent.preventDefault();
                        oEvent.stopPropagation();
                        oDomRef.classList.remove("orderUploadDropZoneDragOver");
                        that._handleFileInput(oEvent.dataTransfer.files);
                    });
                    oDomRef.addEventListener("click", function () {
                        that._oFileInput.click();
                    });
                    this._bDropEventsAttached = true;
                }
            }
            // Register a single resize handler on the Page DOM to keep the
            // bottom VBox height in sync with the available space at all times
            // (covers browser zoom, window resize, panel expand/collapse).
            if (!this._sResizeHandlerId) {
                var oPageDom = this.byId("page").getDomRef();
                if (oPageDom) {
                    this._sResizeHandlerId = ResizeHandler.register(
                        oPageDom, this._adjustHeight.bind(this)
                    );
                }
            }
            this._adjustHeight();
        },

        _adjustHeight: function () {
            var that        = this;
            var oPanel      = this.byId("topPanel").getDomRef();
            var oBottomVBox = this.byId("bottomVBox").getDomRef();
            var oTable      = this.byId("resultTable");
            if (!oPanel || !oBottomVBox || !oTable) { return; }

            // Walk up from the VBox to find the page content <section>
            var oSection = oBottomVBox.parentElement;
            while (oSection && oSection.tagName.toUpperCase() !== "SECTION") {
                oSection = oSection.parentElement;
            }
            if (!oSection) { return; }

            var iSectionH = oSection.getBoundingClientRect().height;
            // If the browser layout is not ready yet, defer to the next frame
            if (iSectionH <= 0) {
                window.requestAnimationFrame(function () { that._adjustHeight(); });
                return;
            }

            var iPanelH = oPanel.getBoundingClientRect().height;
            var iAvail  = Math.floor(iSectionH - iPanelH);
            if (iAvail <= 0) { return; }

            // Set explicit VBox height so any CSS rules have a pixel reference
            oBottomVBox.style.height = iAvail + "px";

            // --- Calculate the correct visible row count ---
            // Measure the non-row overhead inside the table (toolbars + header)
            var oTableDom = oTable.getDomRef();
            var iOverhead = 0;
            if (oTableDom) {
                [".sapUiTableExt",       // extension toolbar (title + buttons)
                 ".sapUiTableColHdrCnt", // column header row
                 ".sapUiTableFtr"        // footer toolbar (Cleanup + Execute)
                ].forEach(function (sSel) {
                    var el = oTableDom.querySelector(sSel);
                    if (el) { iOverhead += Math.ceil(el.getBoundingClientRect().height); }
                });
            }
            // Fallback when table DOM is not ready (compact: ~40+32+40 px)
            if (iOverhead < 50) { iOverhead = 116; }
            iOverhead += 4; // border/scrollbar safety buffer

            // Measure actual row height; compact default is 32 px
            var iRowH = 32;
            if (oTableDom) {
                var oRow = oTableDom.querySelector(".sapUiTableTr");
                if (oRow) {
                    var h = Math.ceil(oRow.getBoundingClientRect().height);
                    if (h > 0) { iRowH = h; }
                }
            }

            var iRowCount = Math.max(1, Math.floor((iAvail - iOverhead) / iRowH));
            oTable.setVisibleRowCount(iRowCount);
        },

        onExit: function () {
            if (this._sResizeHandlerId) {
                ResizeHandler.deregister(this._sResizeHandlerId);
                this._sResizeHandlerId = null;
            }
            if (this._oFileInput && this._oFileInput.parentNode) {
                this._oFileInput.parentNode.removeChild(this._oFileInput);
            }
        },

        onBrowse: function () {
            this._oFileInput.click();
        },

        _onFileSelected: function (oEvent) {
            this._handleFileInput(oEvent.target.files);
        },

        _handleFileInput: function (aFiles) {
            if (!aFiles || aFiles.length === 0) {
                return;
            }
            var oFile = aFiles[0];
            if (!oFile.name.match(/\.xlsx$/i)) {
                MessageToast.show("Please select a valid XLSX file.");
                return;
            }
            this._oFile = oFile;
            this.byId("dropZoneText").setText(oFile.name);
            this.byId("importBtn").setEnabled(true);
        },

        onImport: function () {
            if (!this._oFile) {
                MessageToast.show("Please select a file first.");
                return;
            }
            var XLSX = window.XLSX;
            if (!XLSX) {
                MessageBox.error("XLSX library not loaded. Please check the application configuration.");
                return;
            }
            var that = this;
            var oReader = new FileReader();
            oReader.onload = function (oEvent) {
                try {
                    var aData = new Uint8Array(oEvent.target.result);
                    var oWorkbook = XLSX.read(aData, { type: "array" });
                    var sFirstSheet = oWorkbook.SheetNames[0];
                    var oWorksheet = oWorkbook.Sheets[sFirstSheet];
                    var aRows = XLSX.utils.sheet_to_json(oWorksheet, { defval: "" });

                    //Remove the first row as it contains the column headers
                    if (aRows.length > 0) {
                        aRows.shift();
                    }
                    var sJsonContent = JSON.stringify(aRows);

                    var oModel = that.getView().getModel();
                    oModel.callFunction("/excel_upload", {
                        method: "POST",
                        urlParameters: {
                            rectype: "",
                            filecontent: sJsonContent
                        },
                        success: function (oData) {
                            var aItems = [];
                            if (oData) {
                                if (Array.isArray(oData.results)) {
                                    aItems = oData.results;
                                } else if (Array.isArray(oData)) {
                                    aItems = oData;
                                } else if (typeof oData === "object" && Object.keys(oData).some(function (k) { return k !== "__metadata"; })) {
                                    aItems = [oData];
                                }
                            }
                            aItems = aItems.map(function (oItem) {
                                var oConverted = Object.assign({}, oItem);
                                oConverted.Bstdk = that._formatODataDate(oItem.Bstdk);
                                oConverted.Vdatu = that._formatODataDate(oItem.Vdatu);
                                return oConverted;
                            });
                            that.getOwnerComponent().getModel("results").setProperty("/items", aItems);
                            that._updateExecuteButtonState(aItems);
                            MessageToast.show("Import completed. " + aItems.length + " record(s) returned.");
                        },
                        error: function (oError) {
                            var sMsg = "An error occurred during import.";
                            if (oError.responseJSON && oError.responseJSON.error &&
                                oError.responseJSON.error.message && oError.responseJSON.error.message.value) {
                                sMsg = oError.responseJSON.error.message.value;
                            }
                            MessageBox.error(sMsg);
                        }
                    });
                } catch (err) {
                    MessageBox.error("Error reading XLSX file: " + err.message);
                }
            };
            oReader.onerror = function () {
                MessageBox.error("Failed to read the selected file.");
            };
            oReader.readAsArrayBuffer(this._oFile);
        },

        _updateExecuteButtonState: function (aItems) {
            var bHasUnprocessed = Array.isArray(aItems) && aItems.some(function (oItem) {
                return oItem.Status === "N" || oItem.Status === "E";
            });
            var oResultsModel = this.getOwnerComponent().getModel("results");
            oResultsModel.setProperty("/hasUnprocessed", bHasUnprocessed);
            oResultsModel.setProperty("/itemsCount", Array.isArray(aItems) ? aItems.length : 0);
        },

        _formatODataDate: function (sValue) {
            if (sValue && typeof sValue === "string") {
                var oMatch = sValue.match(/\/Date\((\d+)\)\//);
                if (oMatch) {
                    var oDate = new Date(parseInt(oMatch[1], 10));
                    var sMonth = String(oDate.getUTCMonth() + 1).padStart(2, "0");
                    var sDay = String(oDate.getUTCDate()).padStart(2, "0");
                    var sYear = oDate.getUTCFullYear();
                    return sMonth + "/" + sDay + "/" + sYear;
                }
            }
            return sValue;
        },

        onTopPanelExpand: function () {
            // CSS flex (growFactor=1 on bottomVBox) automatically redistributes
            // the remaining page height when the top panel expands or collapses.
        },

        onCancel: function () {
            this._oFile = null;
            this._oFileInput.value = "";
            this.byId("dropZoneText").setText("Select or drag an XLSX file for preview.");
            this.byId("importBtn").setEnabled(false);
            this.byId("importNameInput").setValue("");
            this.getOwnerComponent().getModel("results").setProperty("/items", []);
            this._updateExecuteButtonState([]);
        },

        onNavToDetail: function (oEvent) {
            var oRow = oEvent.getParameter("row");
            var oContext = oRow.getBindingContext("results");
            var sPath = oContext.getPath(); // e.g. "/items/3"
            var iIndex = parseInt(sPath.split("/").pop(), 10);
            this.getOwnerComponent().getRouter().navTo("RouteDetail", { itemIndex: iIndex });
        },

        onProcessRecords: function () {
            var oResultsModel = this.getOwnerComponent().getModel("results");
            var aItems = oResultsModel.getProperty("/items") || [];
            var bHasUnprocessed = aItems.some(function (oItem) {
                return oItem.Status === "N" || oItem.Status === "E";
            });
            if (!bHasUnprocessed) {
                MessageBox.information("There are no records to process.");
                return;
            }
            var oModel = this.getView().getModel();
            var that = this;
            oModel.callFunction("/process_staging", {
                method: "POST",
                urlParameters: {
                    StgGuid: "00000000-0000-0000-0000-000000000000"
                },
                success: function (oData) {
                    var aItems = [];
                    if (oData) {
                        if (Array.isArray(oData.results)) {
                            aItems = oData.results;
                        } else if (Array.isArray(oData)) {
                            aItems = oData;
                        } else if (typeof oData === "object" && Object.keys(oData).some(function (k) { return k !== "__metadata"; })) {
                            aItems = [oData];
                        }
                    }
                    aItems = aItems.map(function (oItem) {
                        var oConverted = Object.assign({}, oItem);
                        oConverted.Bstdk = that._formatODataDate(oItem.Bstdk);
                        oConverted.Vdatu = that._formatODataDate(oItem.Vdatu);
                        return oConverted;
                    });
                    that.getOwnerComponent().getModel("results").setProperty("/items", aItems);
                    that._updateExecuteButtonState(aItems);
                    MessageToast.show("Processing complete. " + aItems.length + " record(s) returned.");
                },
                error: function (oError) {
                    var sMsg = "An error occurred during processing.";
                    if (oError.responseJSON && oError.responseJSON.error &&
                        oError.responseJSON.error.message && oError.responseJSON.error.message.value) {
                        sMsg = oError.responseJSON.error.message.value;
                    }
                    MessageBox.error(sMsg);
                }
            });
        },

        onShowStagingData: function () {
            var oModel = this.getView().getModel();
            var that = this;
            //oModel.read("/OrdersUpload", {
            oModel.callFunction("/staging_data", {                
                method: "POST",
                urlParameters: {
                    //StgGuid: "00000000-0000-0000-0000-000000000000"
                    rectype: "I"
                },
                success: function (oData) {
                    var aItems = [];
                    if (oData) {
                        if (Array.isArray(oData.results)) {
                            aItems = oData.results;
                        } else if (Array.isArray(oData)) {
                            aItems = oData;
                        } else if (typeof oData === "object" && Object.keys(oData).some(function (k) { return k !== "__metadata"; })) {
                            aItems = [oData];
                        }
                    }
                    aItems = aItems.map(function (oItem) {
                        var oConverted = Object.assign({}, oItem);
                        oConverted.Bstdk = that._formatODataDate(oItem.Bstdk);
                        oConverted.Vdatu = that._formatODataDate(oItem.Vdatu);
                        return oConverted;
                    });
                    that.getOwnerComponent().getModel("results").setProperty("/items", aItems);
                    that._updateExecuteButtonState(aItems);
                    MessageToast.show("Staging data loaded. " + aItems.length + " record(s) returned.");
                },
                error: function (oError) {
                    var sMsg = "An error occurred while loading staging data.";
                    if (oError.responseJSON && oError.responseJSON.error &&
                        oError.responseJSON.error.message && oError.responseJSON.error.message.value) {
                        sMsg = oError.responseJSON.error.message.value;
                    }
                    MessageBox.error(sMsg);
                }
            });
        },

        onProcessedData: function () {
            var oModel = this.getView().getModel();
            var that = this;
            oModel.callFunction("/staging_data", {                
                method: "POST",
                urlParameters: {
                    //StgGuid: "00000000-0000-0000-0000-000000000000"
                    rectype: "S"
                },
                success: function (oData) {
                    var aItems = [];
                    if (oData) {
                        if (Array.isArray(oData.results)) {
                            aItems = oData.results;
                        } else if (Array.isArray(oData)) {
                            aItems = oData;
                        } else if (typeof oData === "object" && Object.keys(oData).some(function (k) { return k !== "__metadata"; })) {
                            aItems = [oData];
                        }
                    }
                    aItems = aItems.map(function (oItem) {
                        var oConverted = Object.assign({}, oItem);
                        oConverted.Bstdk = that._formatODataDate(oItem.Bstdk);
                        oConverted.Vdatu = that._formatODataDate(oItem.Vdatu);
                        return oConverted;
                    });
                    that.getOwnerComponent().getModel("results").setProperty("/items", aItems);
                    that._updateExecuteButtonState(aItems);
                    MessageToast.show("Processed data loaded. " + aItems.length + " record(s) returned.");
                },
                error: function (oError) {
                    var sMsg = "An error occurred while loading processed data.";
                    if (oError.responseJSON && oError.responseJSON.error &&
                        oError.responseJSON.error.message && oError.responseJSON.error.message.value) {
                        sMsg = oError.responseJSON.error.message.value;
                    }
                    MessageBox.error(sMsg);
                }
            });
        },

        onDeleteStagingData: function () {
            var oModel = this.getView().getModel();
            var that = this;
            MessageBox.confirm("Are you sure you want to delete all staging data?", {
                title: "Confirm Deletion",
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                emphasizedAction: MessageBox.Action.YES,
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.YES) {
                        oModel.callFunction("/delete_staging", {
                            method: "POST",
                            urlParameters: {
                                StgGuid: "00000000-0000-0000-0000-000000000000"
                            },
                            success: function () {
                                that.getOwnerComponent().getModel("results").setProperty("/items", []);
                                that._updateExecuteButtonState([]);
                                MessageToast.show("Staging data deleted successfully.");
                            },
                            error: function (oError) {
                                var sMsg = "An error occurred while deleting staging data.";
                                if (oError.responseJSON && oError.responseJSON.error &&
                                    oError.responseJSON.error.message && oError.responseJSON.error.message.value) {
                                    sMsg = oError.responseJSON.error.message.value;
                                }
                                MessageBox.error(sMsg);
                            }
                        });
                    }
                }
            });
        }

    });
});
