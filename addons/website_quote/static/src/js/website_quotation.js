odoo.define('website_quote.website_quote', function (require) {
'use strict';

var ajax = require('web.ajax');
var config = require('web.config');
var Widget = require('web.Widget');
var website = require('website.website');

if(!$('.o_website_quote').length) {
    return $.Deferred().reject("DOM doesn't contain '.o_website_quote'");
}

    // Add to SO button
    var UpdateLineButton = Widget.extend({
        events: {
            'click' : 'onClick',
        },
        /**
         * @override
         */
        start: function () {
            var self = this;
            return this._super.apply(this, arguments).then(function () {
                self.elems = self._getUpdatableElements();
                self.elems.$lineQuantity.change(function (ev) {
                    var quantity = parseInt(this.value);
                    self._onChangeQuantity(quantity);
                });
            });
        },
        /**
         * Process the change in line quantity
         *
         * @private
         * @param {Int} quantity, the new quantity of the line
         *    If not present it will increment/decrement the existing quantity
         */
        _onChangeQuantity: function (quantity) {
            var href = this.$el.attr("href");
            var order_id = href.match(/order_id=([0-9]+)/)[1];
            var line_id = href.match(/update_line(_dict)?\/([0-9]+)/)[2];
            var token = href.match(/token=([\w\d-]*)/)[1];

            var callParams = {
                'line_id': parseInt(line_id),
                'order_id': parseInt(order_id),
                'token': token,
                'remove': this.$el.is('[href*="remove"]'),
                'unlink': this.$el.is('[href*="unlink"]'),
                'input_quantity': quantity >= 0 ? quantity : false,
            };
            this._callUpdateLineRoute(callParams).then(this._updateOrderValues.bind(this));
            return false;
        },
        /**
         * Reacts to the click on the -/+ buttons
         *
         * @param {Event} ev
         */
        onClick: function (ev) {
            ev.preventDefault();
            return this._onChangeQuantity();
        },
        /**
         * Calls the route to get updated values of the line and order
         * when the quantity of a product has changed
         *
         * @private
         * @param {Object} params
         * @return {Deferred}
         */
        _callUpdateLineRoute: function (params) {
            var def = new $.Deferred();
            ajax.jsonRpc("/quote/update_line_dict", 'call', params)
                .then(def.resolve.bind(def))
                .fail(function () {
                    // Compatibility: the server may not have been restarted
                    // So the real route may not exist
                    delete params.input_quantity;
                    ajax.jsonRpc("/quote/update_line", 'call', params)
                        .fail(def.reject.bind(def))
                        .then(function (data) {
                            // Data is an array, convert it to a dict
                            var actualData = data;
                            if (data) {
                                actualData = {
                                    order_amount_total: data[1],
                                    order_line_product_uom_qty: data[0],
                                };
                            }
                            def.resolve(actualData);
                        });
                });
            return def;
        },
        /**
         * Processes data from the server to update the UI
         *
         * @private
         * @param {Object} data: contains order and line updated values
         */
        _updateOrderValues: function (data) {
            if (!data) {
                window.location.reload();
            }

            var orderAmountTotal = data.order_amount_total;
            var orderAmountUntaxed = data.order_amount_untaxed;
            var orderAmountTax = data.order_amount_tax;

            var lineProductUomQty = data.order_line_product_uom_qty;
            var linePriceTotal = data.order_line_price_total;
            var linePriceSubTotal = data.order_line_price_subtotal;

            this.elems.$lineQuantity.val(lineProductUomQty)

            if (this.elems.$linePriceTotal.length && linePriceTotal !== undefined) {
                this.elems.$linePriceTotal.text(linePriceTotal);
            }
            if (this.elems.$linePriceSubTotal.length && linePriceSubTotal !== undefined) {
                this.elems.$linePriceSubTotal.text(linePriceSubTotal);
            }

            if (orderAmountUntaxed !== undefined) {
                this.elems.$orderAmountUntaxed.text(orderAmountUntaxed);
            }

            if (orderAmountTax !== undefined) {
                this.elems.$orderAmountTax.text(orderAmountTax);
            }

            if (orderAmountTotal !== undefined) {
                this.elems.$orderAmountTotal.text(orderAmountTotal);
            }
        },
        /**
         * Locate in the DOM the elements to update
         * Mostly for compatibility, when the module has not been upgraded
         * In that case, we need to fall back to some other elements
         *
         * @private
         * @return {Object}: Jquery elements to update
         */
        _getUpdatableElements: function () {
            var $parentTr = this.$el.parents('tr:first');
            var $linePriceTotal = $parentTr.find('.oe_order_line_price_total .oe_currency_value');
            var $linePriceSubTotal = $parentTr.find('.oe_order_line_price_subtotal .oe_currency_value');

            if (!$linePriceTotal.length && !$linePriceSubTotal.length) {
                $linePriceTotal = $linePriceSubTotal = $parentTr.find('.oe_currency_value').last();
            }

            var $orderAmountUntaxed = $('[data-id="total_untaxed"]>span');
            var $orderAmountTax = $('[data-id="total_taxes"]>span');
            var $orderAmountTotal = $('[data-id="total_amount"]>span');

            if (!$orderAmountUntaxed.length && !$orderAmountTax.length) {
                $orderAmountUntaxed = $orderAmountTotal.eq(1);
                $orderAmountTax = $orderAmountTotal.eq(2);
                $orderAmountTotal = $orderAmountTotal.eq(0).add($orderAmountTotal.eq(3));
            }

            return {
                $lineQuantity: this.$el.parents('.input-group:first').find('.js_quantity'),
                $linePriceSubTotal: $linePriceSubTotal,
                $linePriceTotal: $linePriceTotal,
                $orderAmountUntaxed: $orderAmountUntaxed,
                $orderAmountTax: $orderAmountTax,
                $orderAmountTotal: $orderAmountTotal,
            }
        }
    });

    var update_button_list = [];
    $('a.js_update_line_json').each(function( index ) {
        var button = new UpdateLineButton();
        button.setElement($(this)).start();
        update_button_list.push(button);
    });

    // Accept Modal, with jSignature
    var AcceptModal = Widget.extend({
        events: {
            'shown.bs.modal': 'initSignature',
            'click #sign_clean': 'clearSignature',
            'submit #accept': 'submitForm',
        },
        initSignature: function(ev){
            this.$("#signature").empty().jSignature({'decor-color' : '#D1D0CE', 'color': '#000', 'background-color': '#fff'});
            this.empty_sign = this.$("#signature").jSignature("getData",'image');
        },
        clearSignature: function(ev){
            this.$("#signature").jSignature('reset');
        },
        submitForm: function(ev){
            // extract data
            var self = this;
            var $confirm_btn = self.$el.find('button[type="submit"]');

            // Support 2 routes:
            // - <form id="accept" method="POST" t-attf-action="/quote/accept/#{quotation.id}/?token=#{quotation.access_token}" ...>
            // - <form id="accept" method="POST" t-att-data-order-id="quotation.id" t-att-data-token="quotation.access_token" ...>
            // The first route is deprecated but might still be used if the template is not updated
            var href = self.$el.find('form').attr("action");
            if (href) {
                var action = href.match(/quote\/([a-z]+)/)[1];
                var order_id = parseInt(href.match(/quote\/[a-z]+\/([0-9]+)/)[1]);
                var token = href.match(/token=(.*)/) && href.match(/token=(.*)/)[1];
            }
            else {
                var action = 'accept';
                var order_id = self.$el.find('form').data("order-id");
                var token = self.$el.find('form').data("token");
            }

            if (action == 'accept') {
                ev.preventDefault();
                // process : display errors, or submit
                var signer_name = self.$("#name").val();
                var signature = self.$("#signature").jSignature("getData",'image');
                var is_empty = signature ? this.empty_sign[1] == signature[1] : false;
                self.$('#signer').toggleClass('has-error', !signer_name);
                self.$('#drawsign').toggleClass('panel-danger', is_empty).toggleClass('panel-default', !is_empty);
                if (is_empty || ! signer_name){
                    setTimeout(function () {
                        self.$('button[type="submit"], a.a-submit').removeAttr('data-loading-text').button('reset');
                    })
                    return false;
                }
                $confirm_btn.prepend('<i class="fa fa-spinner fa-spin"></i> ');
                $confirm_btn.attr('disabled', true);
                ajax.jsonRpc("/quote/"+action, 'call', {
                    'order_id': order_id,
                    'token': token,
                    'signer': signer_name,
                    'sign': signature?JSON.stringify(signature[1]):false,
                }).then(function (data) {
                    var message_id = (data) ? 3 : 4;
                    self.$el.modal('hide');
                    window.location.href = '/quote/'+order_id.toString()+'/'+token+'?message='+message_id;
                });
                return false;
            }
        },
    });

    var accept_modal = new AcceptModal();
    accept_modal.setElement($('#modalaccept'));
    accept_modal.start();

    // Nav Menu ScrollSpy
    var NavigationSpyMenu = Widget.extend({
        start: function(watched_selector){
            this.authorized_text_tag = ['em', 'b', 'i', 'u'];
            this.spy_watched = $(watched_selector);
            this.generateMenu();
        },
        generateMenu: function(){
            var self = this;
            // reset ids
            $("[id^=quote_header_], [id^=quote_]", this.spy_watched).attr("id", "");
            // generate the new spy menu
            var last_li = false;
            var last_ul = null;
            _.each(this.spy_watched.find("h1, h2"), function(el){
                switch (el.tagName.toLowerCase()) {
                    case "h1":
                        var id = self.setElementId('quote_header_', el);
                        var text = self.extractText($(el));
                        if (!text) {
                            break;
                        }
                        last_li = $("<li>").append($('<a href="#'+id+'"/>').text(text)).appendTo(self.$el);
                        last_ul = false;
                        break;
                    case "h2":
                        var id = self.setElementId('quote_', el);
                        var text = self.extractText($(el));
                        if (!text) {
                            break;
                        }
                        if (last_li) {
                            if (!last_ul) {
                                last_ul = $("<ul class='nav'>").appendTo(last_li);
                            }
                            $("<li>").append($('<a href="#'+id+'"/>').text(text)).appendTo(last_ul);
                        }
                        break;
                }
            });
        },
        setElementId: function(prefix, $el){
            var id = _.uniqueId(prefix);
            this.spy_watched.find($el).attr('id', id);
            return id;
        },
        extractText: function($node){
            var self = this;
            var raw_text = [];
            _.each($node.contents(), function(el){
                var current = $(el);
                if($.trim(current.text())){
                    var tagName = current.prop("tagName");
                    if(_.isUndefined(tagName) || (!_.isUndefined(tagName) && _.contains(self.authorized_text_tag, tagName.toLowerCase()))){
                        raw_text.push($.trim(current.text()));
                    }
                }
            });
            return raw_text.join(' ');
        }
    });

    var nav_menu = new NavigationSpyMenu();
    nav_menu.setElement($('[data-id="quote_sidebar"]'));
    nav_menu.start($('body[data-target=".navspy"]'));

    var $bs_sidebar = $(".o_website_quote .bs-sidebar");
    $(window).on('resize', _.throttle(adapt_sidebar_position, 200, {leading: false}));
    adapt_sidebar_position();

    function adapt_sidebar_position() {
        $bs_sidebar.css({
            position: "",
            width: "",
        });
        if (config.device.size_class >= config.device.SIZES.MD) {
            $bs_sidebar.css({
                position: "fixed",
                width: $bs_sidebar.outerWidth(),
            });
        }
    }
    
    $bs_sidebar.affix({
        offset: {
            top: 0,
            bottom: $('body').height() - $('#wrapwrap').outerHeight() + $("footer").outerHeight(),
        },
    });
});

odoo.define('website_quote.payment_method', function (require) {
'use strict';

    require('website.website');
    var ajax = require('web.ajax');

    if(!$('#payment_method').length) {
        return $.Deferred().reject("DOM doesn't contain '#payment_method'");
    }

    // dbo note: website_sale code for payment
    // if we standardize payment somehow, this should disappear
    // When choosing an acquirer, display its Pay Now button
    var $payment = $("#payment_method");
    $payment.on("click", "input[name='acquirer']", function (ev) {
            var payment_id = $(ev.currentTarget).val();
            $("div.oe_quote_acquirer_button[data-id]", $payment).addClass("hidden");
            $("div.oe_quote_acquirer_button[data-id='"+payment_id+"']", $payment).removeClass("hidden");
        })
        .find("input[name='acquirer']:checked").click();

    // When clicking on payment button: create the tx using json then continue to the acquirer
    $('.oe_quote_acquirer_button').on("click", 'button[type="submit"],button[name="submit"]', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var $form = $(ev.currentTarget).parents('form');
      var acquirer_id = $(ev.currentTarget).parents('.oe_quote_acquirer_button').first().data('id');
      if (! acquirer_id) {
        return false;
      }
      var href = $(location).attr("href");
      var order_id = href.match(/quote\/([0-9]+)/)[1];
      var token = href.match(/quote\/[0-9]+\/([^\/?]*)/);
      token = token ? token[1] : '';
      ajax.jsonRpc('/quote/' + order_id +'/transaction/' + acquirer_id + (token ? '/' + token : ''), 'call', {}).then(function (data) {
          $form.html(data);
          $form.submit();
      });
   });
});
