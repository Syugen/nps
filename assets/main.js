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
    submitButton.innerHTML = "Submit";
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