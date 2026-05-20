sap.ui.define([], function () {
    "use strict";

    return {

        /**
         * Returns the sap.ui.core.ValueState string for a given status code.
         * E → Error (red), S → Success (green), N → None (neutral)
         */
        statusState: function (sStatus) {
            switch (sStatus) {
                case "E": return "Error";
                case "S": return "Success";
                case "N": return "None";
                case "M": return "Warning";
                default:  return "None";
            }
        },

        /**
         * Returns the SAP icon URI for a given status code.
         * E → error icon, S → accept/checkmark icon, N → pending/new icon
         */
        statusIcon: function (sStatus) {
            switch (sStatus) {
                case "E": return "sap-icon://error";
                case "S": return "sap-icon://sys-enter-2";
                case "N": return "sap-icon://pending";
                case "M": return "sap-icon://edit";
                default:  return "";
            }
        },

        /**
         * Returns a human-readable label for a status code.
         * E → Error, S → Success, N → New
         */
        statusText: function (sStatus) {
            switch (sStatus) {
                case "E": return "Error";
                case "S": return "Success";
                case "N": return "New";
                case "M": return "Modified";
                default:  return sStatus || "";
            }
        }

    };
});
