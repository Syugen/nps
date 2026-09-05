'use strict';

(function() {
  var page = document.getElementById('gallery-page');
  var status = document.getElementById('gallery-status');
  var image = document.getElementById('gallery-image');
  var controls = document.getElementById('gallery-controls');
  var previousButton = document.getElementById('gallery-previous');
  var nextButton = document.getElementById('gallery-next');
  var counter = document.getElementById('gallery-counter');
  var parameters = new URLSearchParams(window.location.search);
  var postParameter = parameters.get('post');
  var imageParameter = parameters.get('image');
  var images = [];
  var index = 0;
  var postUrl;
  var controlsTimer;
  var zoomable = false;
  var actualSize = false;

  function showError(message) {
    status.textContent = message;
    page.classList.add('gallery-error');
  }

  if (!postParameter || !imageParameter) {
    showError('This gallery link is missing its post or image parameter.');
    return;
  }

  try {
    postUrl = new URL(postParameter, window.location.origin);
    if (postUrl.origin !== window.location.origin) {
      throw new Error('The post must be on this site.');
    }
  } catch (error) {
    showError('This gallery link has an invalid post address.');
    return;
  }

  function updateUrl() {
    var galleryUrl = new URL(window.location.pathname, window.location.origin);
    galleryUrl.searchParams.set('post', postUrl.pathname);
    galleryUrl.searchParams.set('image', new URL(images[index], window.location.origin).pathname);
    window.history.replaceState(null, '', galleryUrl.pathname + galleryUrl.search);
  }

  function positionControls() {
    if (controls.hidden) {
      return;
    }
    controls.style.left = (window.innerWidth / 2) + 'px';
    controls.style.top = (window.innerHeight - 40) + 'px';
  }

  function showControls() {
    if (controls.hidden) {
      return;
    }
    positionControls();
    controls.classList.add('gallery-controls-visible');
    window.clearTimeout(controlsTimer);
    controlsTimer = window.setTimeout(function() {
      controls.classList.remove('gallery-controls-visible');
    }, 1800);
  }

  function updateZoomMode() {
    page.classList.toggle('gallery-actual-size', actualSize);
    document.body.classList.toggle('gallery-actual-size', actualSize);
    page.classList.toggle('gallery-zoomable', zoomable && !actualSize);
    window.requestAnimationFrame(positionControls);
  }

  function configureImage() {
    zoomable = image.naturalWidth > window.innerWidth - 32 ||
      image.naturalHeight > window.innerHeight - 32;
    actualSize = false;
    updateZoomMode();
    showControls();
  }

  function render() {
    actualSize = false;
    updateZoomMode();
    image.src = images[index];
    image.alt = 'Image ' + (index + 1) + ' of ' + images.length;
    counter.textContent = (index + 1) + ' / ' + images.length;
    previousButton.disabled = index === 0;
    nextButton.disabled = index === images.length - 1;
    updateUrl();
  }

  function navigate(offset) {
    var nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= images.length) {
      return;
    }
    index = nextIndex;
    render();
  }

  previousButton.addEventListener('click', function() { navigate(-1); });
  nextButton.addEventListener('click', function() { navigate(1); });
  image.addEventListener('load', configureImage);
  image.addEventListener('pointermove', function() {
    showControls();
  });
  image.addEventListener('click', function() {
    if (!zoomable) {
      return;
    }
    actualSize = !actualSize;
    updateZoomMode();
    showControls();
  });
  document.addEventListener('pointermove', showControls);
  document.addEventListener('keydown', function(event) {
    if (event.key === 'ArrowLeft') {
      navigate(-1);
    } else if (event.key === 'ArrowRight') {
      navigate(1);
    }
  });
  window.addEventListener('resize', function() {
    if (!actualSize && image.complete) {
      configureImage();
    }
    positionControls();
  });

  fetch(postUrl.href)
    .then(function(response) {
      if (!response.ok) {
        throw new Error('The post could not be loaded.');
      }
      return response.text();
    })
    .then(function(postHtml) {
      var postDocument = new DOMParser().parseFromString(postHtml, 'text/html');
      var postImages = postDocument.querySelectorAll('img.responsive-img');
      images = Array.prototype.map.call(postImages, function(postImage) {
        return new URL(
          postImage.getAttribute('src'),
          postUrl.href
        ).href;
      });
      if (!images.length) {
        throw new Error('No gallery images were found in this post.');
      }

      var requestedImage = new URL(imageParameter, window.location.origin).pathname;
      var requestedIndex = images.findIndex(function(imageUrl) {
        return new URL(imageUrl).pathname === requestedImage;
      });
      index = requestedIndex >= 0 ? requestedIndex : 0;

      var title = postDocument.querySelector('section h1');
      if (title) {
        document.title = '画廊：' + title.textContent.trim();
      }
      status.hidden = true;
      image.hidden = false;
      controls.hidden = false;
      render();
    })
    .catch(function(error) {
      showError(error.message);
    });
}());
