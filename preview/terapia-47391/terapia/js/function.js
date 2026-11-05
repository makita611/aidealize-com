$(document).on('ready', function() {
  if ( navigator.userAgent.indexOf('Android') > 0 ) {
    $('body').addClass('android');
  }
});


$(document).on('click', 'a[href^=#]', function(){
  var speed = 500;
  var href= $(this).attr("href");
  var target = $(href == "#" || href == "" ? 'html' : href);
  var position = target.offset().top;
  $("html, body").animate({scrollTop:position}, speed, "swing");
  return false;
});

$(document).on('click', '#menu a', function() {
  $(this).toggleClass('opened');
  $('#global-navi').slideToggle('fast');
});

$(window).on('load scroll', function() {
  showToTopButton();
});

$(window).on('load resize', function() {
  fixMenuHeight();
});

function fixMenuHeight() {
  var H = $(window).height();
  var fixH = H - 50 - 94;
  $('#global-navi ul').height(fixH);
}

function showToTopButton() {
  var scTop = $(window).scrollTop();

  if(scTop >= 300) {
    $('#totop').stop().fadeIn('fast');
  } else {
    $('#totop').stop().fadeOut('fast');
  }
}