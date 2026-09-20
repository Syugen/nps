'use strict';

// 评论在 GitHub 中创建；本站不再向第三方服务提交内容。
(function() {
  var form = document.getElementById('comment-form');

  if (!form) {
    return;
  }

  form.addEventListener('submit', function(event) {
    event.preventDefault();

    var name = document.getElementById('comment-form-name').value;
    var message = document.getElementById('comment-form-message').value;
    var commentKey = form.querySelector('input[name="comment-key"]').value;
    var replyTo = form.querySelector('input[name="reply-to"]').value;
    var params = new URLSearchParams({
      title: form.getAttribute('data-issue-title'),
      body: '页面标识：' + commentKey + '\n回复评论：' + replyTo + '\n用户名：' + name + '\n评论：\n' + message
    });

    window.location.assign(form.getAttribute('data-issue-url') + '?' + params.toString());
  });

  var heading = document.getElementById('comment-h2');
  var replyToInput = form.querySelector('input[name="reply-to"]');
  var cancelReply = document.getElementById('cancel-comment-reply');

  document.addEventListener('click', function(event) {
    var replyButton = event.target.closest && event.target.closest('.js-comment-reply');

    if (!replyButton) {
      return;
    }

    replyToInput.value = replyButton.getAttribute('data-reply-to');
    heading.textContent = '回复 ' + replyButton.getAttribute('data-reply-name');
    cancelReply.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('comment-form-message').focus();
  });

  cancelReply.addEventListener('click', function() {
    replyToInput.value = '';
    heading.textContent = '添加评论';
    cancelReply.hidden = true;
  });
}());

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
