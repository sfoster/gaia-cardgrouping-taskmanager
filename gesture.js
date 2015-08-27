(function(exports) {

const kEdgeIntertia = 250;

function SwipeDetector(elem) {
  this.element = elem;
  this._attached = new Set();
}
SwipeDetector.prototype = {

  EVENT_PREFIX: 'cardview-swipe-',
  SWIPE_WOBBLE_THRESHOLD: 3 * window.devicePixelRatio, // equiv. to EdgeSwipeDetector's kSignificant

  _startDate: null,
  _startX: null,
  _deltaX: null,
  _startY: null,
  _deltaY: null,

  deltaX: 0,
  deltaY: 0,
  startTouchPosition: null,

  attachToElement: function(elem) {
    if (!this._started) {
      return;
    }
    this._attached.add(elem);
  },
  detachFromElement: function(elem) {
    this._attached.delete(elem);
  },
  detachFromAll: function() {
    this._attached.clear();
  },
  wip: {
    onColumnSwipeUp: function() {
      // lock parent scroll container axis
      // add expanded class to this item's list container, to enable overflow-y
      // load/draw in rest of column
      // register for collapse gesture
      // register children for cross-slide?
    },

    onRowSwipeUp: function() {
      // cross-slide behavior - remove the target card if its killable
      // cards should track progress on this gesture by animating transformY to follow touch
      // on completion of the gesture, card should be removed if killable, or just spring back
    },

    onRowSwipeDown: function() {
      // expand the column
      // cards should track progress on this gesture by animating transformY to follow touch
      // on completion of the gesture, if the card is in a column with > 1 children, that column should be expanded
      // columns with only 1 card shouldnt register for this gesture?
    },

    onSwipeSidewaysWhileCollapsed: function() {
      // no action, just pan using scrolling
    },
    onSwipeSidewaysWhileExpanded: function() {
      // a swipe that starts on a card in expanded column
      // or on the container
      // collapse the column
      // disable overflow-y once gesture is recognized
      // re-enable overflow-x
    }
  },

  start: function() {
    var container = this.element;

    console.log('start, addEventListener on container: ', container);
    container.addEventListener('touchstart', this); //
    container.addEventListener('touchmove', this);
    container.addEventListener('touchend', this);
    this._attached.clear();
    this._started = true;
  },
  stop: function() {
    this._started = false;
    if (this._attached) {
      this._attached.clear();
    }
  },
  getTargetElementFromTouchEvent: function(evt) {
    for(var node = evt.touches[0].target;
        node && node !== this.element;
        node = node.parentNode) {
      if (this._attached.has(node)) {
        return node;
      }
    }
    return;
  },
  handleEvent: function(evt) {
    var target;

    switch (evt.type) {
      case 'touchmove':
        if (this._cancelTimeout) {
          clearTimeout(this._cancelTimeout);
        }
        if (!this.currentTarget) {
          console.log('touchmove, no currentTarget', evt);
          return;
        }
        if (!this.startTouchPosition) {
          console.log('touchmove, no gesture in progress:', evt);
          return;
        }
        if (evt.changedTouches.length > 1) {
          console.log('multi-touch, cancel gesture:', evt);
          this.dispatch('cancel', this.currentTarget, evt);
          return;
        }
        evt.stopPropagation();
        this._update(evt.changedTouches[0]);

        var absX = Math.abs(this._deltaX),
            absY = Math.abs(this._deltaY);
        if (this._swipeAxis) {
          this.dispatch('progress', this.currentTarget, evt);
        } else if (absX >= this.SWIPE_WOBBLE_THRESHOLD ||
                   absY >= this.SWIPE_WOBBLE_THRESHOLD) {
          this._swipeAxis = absX > absY ? 'horizontal' : 'vertical';
          this.dispatch('start', this.currentTarget, evt);
        }
        break;
      case 'touchstart':
        if (this.currentTarget || this.startTouchPosition) {
          this._cancelCurrentSwipe();
        } else {
          this.reset();
        }
        target = this.getTargetElementFromTouchEvent(evt);
        if (!target) {
          console.log('SwipeDetector, no valid target for evt:', evt);
          // no-one cares, just return
          return;
        }
        this.currentTarget = target;
        var touch = evt.changedTouches[0];
        this.startTouchPosition = [
          touch.pageX, touch.pageY
        ];
        this._startDate = Date.now();

        // start a new gesture
        console.log('touchstart event on container element, start new gesture');
        evt.stopPropagation();
        this._deltaX = 0;
        this._deltaY = 0;

        this._cancelTimeout = setTimeout((function longTouch() {
          // Didn't move for a while after the touchstart,
          // this isn't a swipe
          clearTimeout(this._cancelTimeout);
          this._cancelTimeout = null;
          // TODO: could forward event?
        }).bind(this), 300);

        break;
      case 'touchend':
        console.log('touchend, currentTarget:', this.currentTarget);
        if (!(this.currentTarget && this.startTouchPosition)) {
          console.log('touchend, no gesture in progress');
          return;
        }
        // swipe gestures are not multi-touch
        var touches = evt.touches.length + evt.changedTouches.length;
        if (touches > 1) {
          this._cancelCurrentSwipe(evt);
          return;
        }
        this._update(evt.changedTouches[0]);
        console.log('dispatching -end event for currentTarget', this.currentTarget);
        this.dispatch('end', this.currentTarget, evt);
        this.reset();
        break;
    }
  },

  reset: function() {
    this.startTouchPosition = null;
    this._swipeAxis = null;
    this._deltaX = 0;
    this._deltaY = 0;
    this._deltaT = 0;
    this.currentTarget = null;
  },

  _update: function(touch) {
    // FIXME: clamp to initial axis
    this._deltaX = touch.pageX - this.startTouchPosition[0];
    this._deltaY = touch.pageY - this.startTouchPosition[1];
    this._deltaT = Date.now() - this._startDate;
  },

  _getSwipeDetail: function() {
    // FIXME: clamp to initial axis
    var direction, swipeAxis;
    if (Math.abs(this._deltaX) > Math.abs(this._deltaY)) {
      direction = this._deltaX > 0 ? 'right' : 'left';
      swipeAxis = 'horizontal';
    } else {
      direction = this._deltaY > 0 ? 'down' : 'up';
      swipeAxis = 'vertical';
    }
    return {
      swipeAxis: swipeAxis,
      direction: direction,
      deltaX: this._deltaX,
      deltaY: this._deltaY,
      deltaT: this._deltaT
    };
  },

  _cancelCurrentSwipe: function(evt) {
    this.dispatch('cancel', this.currentTarget, this._getSwipeDetail());
    this.reset();
  },

  dispatch: function(name, target, originalEvent) {
    var detail = this._getSwipeDetail();
    if (name.match(/start|end/)) {
      console.log('dispatching: ', this.EVENT_PREFIX + name, detail);
    }
    var evt = new CustomEvent(this.EVENT_PREFIX + name, {
        detail: detail,
        bubbles: true,
        cancelable: true
    });
    target.dispatchEvent(evt);
    return evt;
  }
};


var swipeDetector = new SwipeDetector(document.getElementById('cards-list'));
swipeDetector.start();
exports.swipeDetector = swipeDetector;

})(window);
