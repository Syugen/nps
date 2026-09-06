'use strict';

// Static comments
// originally sourced from: https://github.com/eduardoboucas/popcorn/blob/gh-pages/js/main.js
var addComment = function() {

  var select = function(s) {
    return document.querySelector(s);
  };

  var I = function(id) {
    return document.getElementById(id);
  };

  var submitButton = select("#comment-form-submit");

  var form = select('#comment-form');
  form.doReset = function() {
    submitButton.innerHTML = "提交";
    this.classList.remove('disabled');
    if (window.grecaptcha) {
      grecaptcha.reset();
    }
  };

  var errorHandler = function(title, err) {
    console.log(err);
    var msg = '发生了以下错误：<br>';
    if (err.errorCode)
      msg += '[' + err.errorCode + ']<br>' + err.message;
    else
      msg += err;
    msg += '<br>球球好心人访问<a href="https://github.com/Syugen/nps/issues">这里</a>，创建新issue然后把上面的内容粘过去。拜托拜托🙏🏻！';
    showModal(title, msg);
    form.doReset();
  }

  var postComment = function() {
    fetch(form.getAttribute('action'), {
      method: 'POST',
      body: new URLSearchParams(new FormData(form)),
      headers: new Headers({'content-type': 'application/x-www-form-urlencoded'})
    }).then(
      function (data) {
        if (data.ok) {
          //showModal('评论已提交', '您的评论<a href="https://github.com/Syugen/nps/pulls">正在审核中</a>。博主选择后将会显示。');
          showModal('评论已提交', '您的评论将在几分钟后展示。');
          form.reset();
          form.doReset();
        } else {
          data.json().then(function(err) {
            errorHandler('信息有误', err);
          });
        }
      }
    ).catch(function (err) {
      console.error(err);
      errorHandler('意外错误', err);
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    submitButton.innerHTML =
      '<svg class="icon spin"><use xlink:href="#icon-loading"></use></svg> 提交中...';

    form.classList.add('disabled');

    var email = select('#comment-form-email');
    if (email.value)
    {
      fetch(this.getAttribute('encrypt') + email.value).then(
        function (data) {
          if (data.ok) {
            data.text().then(async function(data2) {
              I('comment-encryped-email').value = data2;
              await new Promise(r => setTimeout(r, 1000));
              postComment();
            });
          } else {
            data.json().then(function(err) {
              errorHandler('信息有误', err);
            });
          }
        }
      ).catch(function (err) {
        console.error(err);
        errorHandler('意外错误', err);
      });
    } else {
postComment();
    }
  });

  select('.js-close-modal').addEventListener('click', function () {
    select('body').classList.remove('show-modal');
  });

  function showModal(title, message) {
    select('.js-modal-title').innerText = title;
    select('.js-modal-text').innerHTML = message;
    select('body').classList.add('show-modal');
  }

  // Staticman comment replies, from https://github.com/mmistakes/made-mistakes-jekyll
  // modified from Wordpress https://core.svn.wordpress.org/trunk/wp-includes/js/comment-reply.js
  // Released under the GNU General Public License - https://wordpress.org/about/gpl/
  // addComment.moveForm is called from comment.html when the reply link is clicked.

  return {

    // commId - the id attribute of the comment replied to (e.g., "comment-10")
    // respondId - the string 'respond', I guess
    // parentUid - the UID of the parent comment
    moveForm: function(commId, respondId, parentUid) {
      var t           = this;
      var comm        = I( commId );                                // whole comment
      var respond     = I( respondId );                             // whole new comment form
      var cancel      = I( 'cancel-comment-reply-link' );           // whole reply cancel link
      var parentuidF  = I( 'comment-replying-to-uid' );             // a hidden element in the comment

      if ( ! comm || ! respond || ! cancel || ! parentuidF ) {
        return;
      }

      t.respondId = respondId;

      if ( ! I( 'sm-temp-form-div' ) ) {
        var div = document.createElement('div');
        div.id = 'sm-temp-form-div';
        div.style.display = 'none';
        respond.parentNode.insertBefore(div, respond); // create and insert a bookmark div right before comment form
      }

      comm.parentNode.insertBefore( respond, comm.nextSibling );  // move the form from the bottom to above the next sibling
      parentuidF.value = parentUid;
      cancel.style.display = '';                        // make the cancel link visible
      respond.style.margin = '0px 0px 0px 3em';
      I( 'comment-h2' ).innerHTML = "回复评论";

      cancel.onclick = function() {
        var temp    = I( 'sm-temp-form-div' );            // temp is the original bookmark
        var respond = I( t.respondId );                   // respond is the comment form

        if ( !temp || !respond ) {
          return;
        }

        I('comment-replying-to-uid').value = null;
        temp.parentNode.insertBefore(respond, temp);  // move the comment form to its original location
        temp.parentNode.removeChild(temp);            // remove the bookmark div
        this.style.display = 'none';                  // make the cancel link invisible
        this.onclick = null;                          // retire the onclick handler
        I( 'comment-h2' ).innerHTML = "添加评论";
      respond.style.margin = '0px 0px 0px 0px';
        return false;
      };

      I('comment-form-message').focus();

      return false;
    }
  }
}();

// 在文章图片上悬停时显示独立的放大预览层；原图本身不会被改变。
(function() {
  var section = document.querySelector('.wrapper section');
  var images = section && section.querySelectorAll('img.responsive-img');
  var activePreview = null;

  if (!section || !images || !images.length) {
    return;
  }

  function removePreview(immediately) {
    if (!activePreview) {
      return;
    }

    var preview = activePreview;

    // 立即移除必须能打断正在缩回的旧预览；否则快速重新进入时它会遗留在屏幕上。
    if (immediately) {
      activePreview = null;
      preview.element.remove();
      return;
    }

    if (preview.closing) {
      return;
    }

    // 鼠标离开后，预览先缩回原图的位置；动画结束后才移除这一层。
    preview.closing = true;
    var sourceRect = preview.source.getBoundingClientRect();
    preview.element.style.top = sourceRect.top + 'px';
    preview.element.style.left = sourceRect.left + 'px';
    preview.element.style.width = sourceRect.width + 'px';

    var finish = function() {
      if (activePreview === preview) {
        activePreview = null;
        preview.element.remove();
      }
    };

    preview.element.addEventListener('transitionend', function(event) {
      if (event.propertyName === 'width') {
        finish();
      }
    });
    window.setTimeout(finish, 200);
  }

  function isInside(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function imageAt(x, y) {
    for (var index = 0; index < images.length; index++) {
      if (isInside(images[index].getBoundingClientRect(), x, y)) {
        return images[index];
      }
    }
    return null;
  }

  function showPreview(image) {
    removePreview(true);

    var imageRect = image.getBoundingClientRect();
    var sectionRect = section.getBoundingClientRect();

    // 已经几乎占满正文宽度的图片没有可见的放大空间，不显示预览。
    if (imageRect.width >= sectionRect.width - 2) {
      return;
    }

    var viewportPadding = 8;
    var targetWidth = sectionRect.width;
    var expandedHeight = imageRect.height * targetWidth / imageRect.width;
    var imageCenter = imageRect.top + imageRect.height / 2;
    var targetTop;

    // 若按正文全宽展开会超出视口，等比缩小预览，使它始终与上下边缘留出 8px。
    // 只有在这种极高图片的情况，预览才会小于正文宽度，并在正文范围内居中。
    if (expandedHeight > window.innerHeight - viewportPadding * 2) {
      expandedHeight = window.innerHeight - viewportPadding * 2;
      targetWidth = expandedHeight * imageRect.width / imageRect.height;
    }

    // 中间区域收窄为视口高度的中间 20%：上段向下、下段向上、中段保持中心不动。
    if (imageCenter < window.innerHeight * 0.4) {
      targetTop = imageRect.top;
    } else if (imageCenter > window.innerHeight * 0.6) {
      targetTop = imageRect.bottom - expandedHeight;
    } else {
      targetTop = imageCenter - expandedHeight / 2;
    }

    // 无论图片原先是否已有一部分在屏幕外，展开后的上下边界都限制在视口内。
    targetTop = Math.max(
      viewportPadding,
      Math.min(targetTop, window.innerHeight - viewportPadding - expandedHeight)
    );

    var preview = document.createElement('div');
    var previewImage = document.createElement('img');

    preview.className = 'image-hover-preview';
    preview.style.top = imageRect.top + 'px';
    preview.style.left = imageRect.left + 'px';
    preview.style.width = imageRect.width + 'px';
    previewImage.src = image.currentSrc || image.src;
    previewImage.alt = image.alt;
    preview.appendChild(previewImage);
    document.body.appendChild(preview);

    activePreview = {
      element: preview,
      source: image,
      closing: false
    };

    // 浏览器先绘制与原图完全重合的预览，再在下一帧展开到正文宽度和对应的纵向位置。
    window.requestAnimationFrame(function() {
      if (!activePreview || activePreview.element !== preview) {
        return;
      }

      preview.style.top = targetTop + 'px';
      preview.style.left = (sectionRect.left + (sectionRect.width - targetWidth) / 2) + 'px';
      preview.style.width = targetWidth + 'px';
    });
  }

  for (var i = 0; i < images.length; i++) {
    images[i].addEventListener('pointerenter', function(event) {
      showPreview(event.currentTarget);
    });
  }

  function openImageGallery(image) {
    var galleryUrl = new URL('/nps/gallery/', window.location.origin);
    var imageUrl = new URL(image.currentSrc || image.src, window.location.href);

    galleryUrl.searchParams.set('post', window.location.pathname);
    galleryUrl.searchParams.set('image', imageUrl.pathname);
    window.open(galleryUrl.href, '_blank');
  }

  for (var imageIndex = 0; imageIndex < images.length; imageIndex++) {
    (function(index) {
      images[index].addEventListener('click', function(event) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        openImageGallery(images[index]);
      });
    })(imageIndex);
  }

  document.addEventListener('pointermove', function(event) {
    if (!activePreview || activePreview.closing) {
      // Scrolling can move an image beneath a stationary pointer without firing
      // pointerenter. The next pointer movement checks the current coordinates.
      var hoveredImage = imageAt(event.clientX, event.clientY);
      if (hoveredImage) {
        showPreview(hoveredImage);
      }
      return;
    }

    var sourceRect = activePreview.source.getBoundingClientRect();
    var previewRect = activePreview.element.getBoundingClientRect();

    if (!isInside(sourceRect, event.clientX, event.clientY) &&
        !isInside(previewRect, event.clientX, event.clientY)) {
      removePreview();
    }
  });

  window.addEventListener('scroll', function() {
    removePreview(true);
  }, { passive: true });
  window.addEventListener('resize', function() {
    removePreview(true);
  });
}());

// Within one rendered paragraph, consecutive hf=1 image includes alternate
// left/right automatically.
(function() {
  var paragraphs = document.querySelectorAll('section > p');

  for (var paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    var nextIsLeft = true;
    var children = paragraphs[paragraphIndex].children;

    for (var childIndex = 0; childIndex < children.length; childIndex++) {
      var image = children[childIndex].querySelector('img.image-half-auto');
      if (image) {
        image.classList.add(nextIsLeft ? 'image-half-left' : 'image-half-right');
        nextIsLeft = !nextIsLeft;
      } else if (children[childIndex].querySelector('img.responsive-img')) {
        nextIsLeft = true;
      }
    }
  }
}());

// After intrinsic dimensions are known, calculate a proportional display width
// for each full-width image without an explicit w attribute. On a wide content
// column, this avoids combining min-width and max-height constraints, which can
// distort an image when those limits conflict.
(function() {
  var narrowColumnWidth = 504;
  var minimumImageWidth = 400;
  var maximumImageWidth = 800;
  var images = document.querySelectorAll('img.responsive-img.image-full-auto-size');

  function updateDisplaySize(image) {
    var section = image.closest('section');
    if (!section || section.clientWidth <= narrowColumnWidth) {
      image.style.removeProperty('--full-image-display-width');
      return;
    }

    var aspectRatio = image.naturalHeight / image.naturalWidth;
    var heightLimitedWidth = window.innerHeight * 2 / 3 / aspectRatio;
    var targetWidth = Math.min(
      section.clientWidth,
      maximumImageWidth,
      Math.max(minimumImageWidth, Math.min(image.naturalWidth, heightLimitedWidth))
    );
    image.style.setProperty('--full-image-display-width', targetWidth + 'px');
  }

  for (var index = 0; index < images.length; index++) {
    if (images[index].complete && images[index].naturalWidth) {
      updateDisplaySize(images[index]);
    } else {
      images[index].addEventListener('load', function(event) {
        updateDisplaySize(event.currentTarget);
      });
    }
  }

  window.addEventListener('resize', function() {
    for (var index = 0; index < images.length; index++) {
      if (images[index].naturalWidth) {
        updateDisplaySize(images[index]);
      }
    }
  });
}());

// On wide screens, gradually hide the sidebar and center the article while
// scrolling through the first 200px of the page.
(function() {
  // 暂时关闭滚动淡出效果；保留后续代码，日后只需改为 true 即可重新启用。
  var sidebarScrollTransitionEnabled = false;
  var wideScreen = window.matchMedia('(min-width: 1150px)');
  var wrapper = document.querySelector('.wrapper');
  var header = wrapper && wrapper.querySelector('header');
  var section = wrapper && wrapper.querySelector('section');
  var ticking = false;

  if (!wrapper || !header || !section) {
    return;
  }

  if (!sidebarScrollTransitionEnabled) {
    header.style.opacity = '';
    header.style.visibility = '';
    section.style.transform = '';
    return;
  }

  function updateLayout() {
    ticking = false;

    if (!wideScreen.matches) {
      header.style.opacity = '';
      header.style.visibility = '';
      section.style.transform = '';
      return;
    }

    var progress = Math.min(Math.max(window.pageYOffset / 200, 0), 1);
    var sidebarWidth = wrapper.clientWidth - section.offsetWidth;
    var sectionShift = sidebarWidth / 2 * progress;

    header.style.opacity = 1 - progress;
    header.style.visibility = progress >= 1 ? 'hidden' : 'visible';
    section.style.transform = 'translateX(-' + sectionShift + 'px)';
  }

  function requestLayoutUpdate() {
    if (!ticking) {
      window.requestAnimationFrame(updateLayout);
      ticking = true;
    }
  }

  window.addEventListener('scroll', requestLayoutUpdate, { passive: true });
  window.addEventListener('resize', requestLayoutUpdate);
  updateLayout();
}());
