$(document).on('click', '.faq-list li dl dt a:not(.opened)', function() {
  var parentDD = $('.faq-list li dl dd');
  var parentDT = $('.faq-list li dl dt a');

  $(parentDT).removeClass('opened');
  $(parentDD).stop().slideUp('easeInOutSine');
  $(this).addClass('opened');
  $(this).parent('dt').next('dd').slideDown('easeInOutSine');
});

$(document).on('click', '.faq-list li dl dt a.opened', function() {
  $(this).removeClass('opened');
  $(this).parent('dt').next('dd').slideUp('easeInOutSine');
});

function fixHeight() {
  var H = $(window).height();
  var obj = $('#site-header').height() + $('#site-footer').height() +$('#page-title').height();
  var fixHeight = H - obj;

  if($('#page-contact-complete').length) {
    $('#container').css('min-height',fixHeight);
  }
}

$(document).on('ready', function() {
  fixHeight();
});

$(window).on('resize', function() {
  fixHeight();
});