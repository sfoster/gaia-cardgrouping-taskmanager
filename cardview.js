/* global swipeDetector */
var cardsByAppInstanceID = {};
var _appInstanceIdCount = 0;
// > .column > .cardgroup-list > [data-position="0"]
var cards = [];

Array.from(document.querySelectorAll('#cards-list > .column')).forEach(function(column, columnIdx, set) {
  // Update the screen reader column list size.
  column.setAttribute('aria-setsize', set.length);
  // Update the screen reader column index.
  column.setAttribute('aria-posinset', columnIdx + 1);

  var cardElements = Array.from(column.querySelectorAll('.card'));
  var groupSize = cardElements.length;
  var isGroup = groupSize > 1;

  if (isGroup) {
    column.classList.add('group');
  }
  cardElements.forEach(function(elem, rowIdx) {
    var card = {
      element: elem,
      init: function() {
        this.app = {
          instanceID: _appInstanceIdCount++,
          killable: function() { return true; }
        };
        this.columnIndex = columnIdx;
        if (isGroup) {
          this.rowIndex = rowIdx;
        }
        this.closeButton = this.element.querySelector('.close-button');
        this.closeButton.addEventListener('click', this);
        this.element.dataset.groupsize = rowIdx === 0 ? groupSize : 1;
        this.element.dataset.position = rowIdx;
        this.element.dataset.closeable = true;
        this.element.dataset.appInstanceId = this.app.instanceID;
        console.log('init card: ', this.element);
      },
      killApp: function() {
        console.log('killApp');
        swipeDetector.detachFromElement(this.element);
        this.closeButton.removeEventListener('click', this);
        cardGroups.closeCard(this.element);
      },
      handleEvent: function(evt) {
        switch (evt.type) {
          case 'click':
            if (evt.target === this.closeButton) {
              evt.stopImmediatePropagation();
              this.killApp();
            }
            break;
        }
      }
    };
    cards.push(card);
    card.init();
    cardsByAppInstanceID[card.app.instanceID] = card;
  });
});

var cardGroups = {
  element: document.getElementById('cards-view'),
  cardsList: document.getElementById('cards-list'),
  _expandedColumn: null,

  CARD_GUTTER: 25,
  CARD_VERTICAL_SPACING: 120,
  SWIPE_COLLAPSE_THRESHOLD: window.innerWidth * 0.25 * window.devicePixelRatio,
  SWIPE_EXPAND_THRESHOLD: window.innerWidth * 0.25 * window.devicePixelRatio,
  SWIPE_TO_CLOSE_THRESHOLD: window.innerHeight * 0.25 * window.devicePixelRatio,


  init: function() {
    this.cardsList.addEventListener('cardview-swipe-start', this);
    this.cardsList.addEventListener('cardview-swipe-end', this);
    this.cardsList.addEventListener('cardview-swipe-progress', this);
    this.cardsList.addEventListener('cardview-swipe-cancel', this);

    this.windowWidth = window.innerWidth;
    this.windowHeight = window.innerHeight;
    this.cardWidth = this.windowWidth * 0.5;
    this.cardHeight = this.windowHeight * 0.5;
    this._setContentWidth(this.cardsList.children.length);
    // decorate each <li> with its position in its list
    // we do this in the card.init too, whatever.
    Array.from(this.element.querySelectorAll('.column')).forEach(function(column) {
      var listNode = column.firstElementChild;
      this._updateItemPositions(listNode);
      this._placeCardsInColumn(column);
    }, this);
    this._placeCardsInRow();
  },

  _setContentWidth: function (length) {
    var listNode = this.cardsList;
    var cardWidth = this.cardWidth;
    var margins = this.windowWidth - cardWidth;
    // total width of left/right "margin" + call cards and their gutters
    var cardStripWidth = (cardWidth * length) +
                         (this.CARD_GUTTER * (length - 1));
    var contentWidth = margins +
                       Math.max(cardWidth, cardStripWidth);
    this.cardsList.style.width = contentWidth + 'px';
  },

  _setColumnHeight: function (column, length) {
    var listNode = column.firstElementChild;
    var cardHeight = this.cardHeight;
    var margins = this.windowHeight - cardHeight;
    // total height of top/bottom "margin" + all cards and their vertical spacing
    var cardStripHeight = (cardHeight * length) +
                         (this.CARD_VERTICAL_SPACING * (length - 1));
    var contentHeight = margins +
                       Math.max(cardHeight, cardStripHeight);
    listNode.style.height = contentHeight + 'px';
  },

  isCard: function(elem) {
    return elem.dataset.appInstanceId && elem.classList.contains('card');
  },
  getContainingColumn: function(elem) {
    for(var node = elem;
        node && node !== this.cardsList;
        node = node.parentNode) {
      if (node.classList.contains('column')) {
        return node;
      }
    }
    return;
  },
  changeExpandedState: function(toExpanded, column) {
    if (toExpanded) {
      if (this._expandedColumn) {
        throw new Error('changeExpandedState, column already expanded:' +
                        this._expandedColumn.dataset.position);
      }
      // exit collapsed state
      swipeDetector.detachFromAll();
      this.resetScrollAxes();

      // enter expanded state
      this._expandedColumn = column;
      this.toggleScrollingOnAxis('horizontal', false);
      column.classList.toggle('expanded', true);
      // cache the scrollTopMax, so we know if scroll occurs at scroll extents
      // forces reflow?
      this._scrollTopMax = this._expandedColumn.scrollTopMax;

      for(var i=0, rows = column.firstElementChild.children;
          i < rows.length;
          i++) {
        swipeDetector.attachToElement(rows[i]);
        rows[i].style.removeProperty('transform');
      }
    } else {
      if (this._expandedColumn) {
        // exit expanded state
        this.resetScrollAxes();
        this._expandedColumn.classList.toggle('expanded', false);
        this._expandedColumn = null;
        delete this._scrollTopMax;
        swipeDetector.detachFromAll();
      }
      // enter collapsed state
      for(var j=0, firstCards = this.cardsList.querySelectorAll('.card[data-position="0"]');
          j < firstCards.length;
          j++) {
        swipeDetector.attachToElement(firstCards[j]);
      }
    }
  },
  slideCard: function(elem, detail) {
    this._slideDetail = detail;
    if (!detail) {
      elem.style.removeProperty('transform');
      delete this._slideDetail;
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        delete this._rafId;
      }
      return;
    }
    if (this._rafId) {
      return;
    }
    var nextFrame = (function() {
      delete this._rafId;
      delete this._slideDetail;
      // we have detail.deltaT, could calculate a velocity and
      // set a transition-duration here
      if (detail.swipeAxis === 'vertical') {
        elem.style.transform = 'translateY('+detail.deltaY+'px)';
      } else {
        elem.style.transform = 'translateX('+detail.deltaX+'px)';
      }
    }).bind(this);
    this._rafId = window.requestAnimationFrame(nextFrame);
  },
  toggleScrollingOnAxis: function(whichAxis, enable) {
    switch (whichAxis) {
      case 'horizontal':
        this.element.style.overflowX =  enable ? 'auto' : 'hidden';
        console.log('toggleScrollingOnAxis: horizontal', this.element.style.overflowX);
        break;
      case 'vertical':
        if (this._expandedColumn) {
          this._expandedColumn.style.overflowX = enable ? 'auto': 'hidden';
          console.log('toggleScrollingOnAxis: vertical', this._expandedColumn.style.overflowX);
        }
        break;
    }
  },
  resetScrollAxes: function(whichAxis) {
    this.element.style.removeProperty('overflow-x');
    if (this._expandedColumn) {
      this._expandedColumn.style.removeProperty('overflow-x');
    }
  },
  handleEvent: function(evt) {
    var detail = evt.detail;
    var target = evt.target;

    if (this._expandedColumn) {
      switch (evt.type) {
        case 'cardview-swipe-start':
        case 'cardview-swipe-end':
        case 'cardview-swipe-progress':
        case 'cardview-swipe-cancel':
          this.handleSwipeEventOnExpandedGroup(evt);
          break;
      }
    } else {
      switch (evt.type) {
        case 'cardview-swipe-start':
        case 'cardview-swipe-end':
        case 'cardview-swipe-progress':
        case 'cardview-swipe-cancel':
          this.handleSwipeEventOnCollapsedGroup(evt);
          break;
      }
    }
  },
  handleSwipeEventOnExpandedGroup: function(evt) {
    var detail = evt.detail;
    var target = evt.target;
    var column = this._expandedColumn;

    var isSwipeBeyondScrollExtent = (function(target, detail) {
      if (!this.isCard(target)) {
        return false;
      }
      if (detail.direction == 'down' &&
          parseInt(target.dataset.position) === 0 &&
          this._scrollTopStart === 0) {
        // the top card, already scrolled to top
        return true;
      }
      if (detail.direction == 'up' &&
          parseInt(target.dataset.position) === target.parentNode.childElementCount -1 &&
          this._scrollTopMax - this._scrollTopStart === 0) {
        // the bottom card, already scrolled to bottom
        return true;
      }
      return false;
    }).bind(this);

    switch (evt.type) {
      case 'cardview-swipe-progress':
        if (isSwipeBeyondScrollExtent(target, detail)) {
          console.log('isSwipeBeyondScrollExtent: true');
          // just let the overscroll do its thing
        }
        else if (detail.swipeAxis === 'horizontal') {
          if (this.isCard(target)) {
          // just let the overscroll do its thing
          } else {
            // TODO: any visual feedback, or indication that this gesture will result
            // in collapsing the list?
          }
        } else {
          console.log('just scrolling up/down on expanded column');
        }
        break;

      case 'cardview-swipe-start':
        this._scrollTopStart = column.scrollTop;
        console.log('handling cardview-swipe-start, _scrollTopStart: ', this._scrollTopStart);

        if (isSwipeBeyondScrollExtent(target, detail)) {
          // we'll let overscroll do its thing.
        }
        if (detail.swipeAxis === 'horizontal') {
          // stop it drifting on y-scroll-axis while we drag horizontaly
          this.toggleScrollingOnAxis('vertical', false);
        }
        break;

      case 'cardview-swipe-end':
        this.toggleScrollingOnAxis('horizontal', false);
        this.toggleScrollingOnAxis('vertical', true);

        if (isSwipeBeyondScrollExtent(target, detail)) {
            if (Math.abs(detail.deltaY) > this.SWIPE_COLLAPSE_THRESHOLD) {
              console.log('swipe on top/bottom card, changing to collapsed state');
              this.changeExpandedState(false);
            }
        }
        else if (detail.swipeAxis === 'horizontal') {
          if (this.isCard(target) && Math.abs(detail.deltaX) > this.SWIPE_COLLAPSE_THRESHOLD) {
            this.changeExpandedState(false);
          }
        }
        break;

      case 'cardview-swipe-cancel':
        this.resetScrollAxes();
        if (this.isCard(target)) {
          this.slideCard(target); // reset transform
        }
        break;
    }
  },
  handleSwipeEventOnCollapsedGroup: function(evt) {
    var detail = evt.detail;
    var target = evt.target;
    console.assert(this.SWIPE_EXPAND_THRESHOLD, 'this.SWIPE_EXPAND_THRESHOLD');
    // TODO: currently all actions are on swipe-end. But it makes sense for
    // some to kick in as a threshold is passed
    switch (evt.type) {
      case 'cardview-swipe-progress':
        if (detail.swipeAxis === 'vertical' && this.isCard(target)) {
          this.slideCard(target, evt.detail);
        }
        break;
      case 'cardview-swipe-start':
        console.log('handleSwipeEventOnCollapsedGroup: ', evt);
        if (detail.swipeAxis === 'vertical') {
          target.style.willChange =   'transform';
          target.style.transition = 'transform 0s linear';
          this.toggleScrollingOnAxis('horizontal', false);
        } else {
          this.toggleScrollingOnAxis('vertical', false);
        }
        break;
      case 'cardview-swipe-end':
        this.resetScrollAxes();
        target.style.removeProperty('will-change');
        target.style.removeProperty('transform');

        if (this.isCard(target) &&
            detail.direction === 'down' &&
            Math.abs(detail.deltaY) > this.SWIPE_EXPAND_THRESHOLD &&
            parseInt(target.dataset.groupsize) > 1) {
          // swipe to expand a group
          this.slideCard(target); // reset
          this.changeExpandedState(true, this.getContainingColumn(target));
          return;
        }
        if ((detail.direction === 'up') &&
            (Math.abs(detail.deltaY) > this.SWIPE_TO_CLOSE_THRESHOLD)) {
          if (target.dataset.closeable) {
            this.closeCard(target);
            return;
          }
        }
        this.slideCard(target); // reset
        break;
      case 'cardview-swipe-cancel':
        this.slideCard(target);
        break;
    }
  },
  _centerCardAtHorizontalPosition: function(idx, smooth) {
    var position = (this.cardWidth + this.CARD_GUTTER) * idx;
    if (smooth) {
      this.element.scrollTo({left: position, top: 0, behavior: 'smooth'});
    } else {
      this.element.scrollTo(position, 0);
    }
  },
  _centerCardAtColumnPosition: function(column, idx, smooth) {
    var position = (this.cardHeight + this.CARD_VERTICAL_SPACING) * idx;
    if (smooth) {
      column.scrollTo({left: 0, top: position, behavior: 'smooth'});
    } else {
      column.scrollTo(0, position);
    }
  },

  _updateItemPositions: function(listNode, firstIndex) {
    var itemNodes = listNode.children;
    for (var item, i = firstIndex || 0; (item = itemNodes[i]); i++) {
      if (item) {
        item.dataset.position = i;
        item.setAttribute('aria-setsize', itemNodes.length);
      // Update the screen reader card index.
        item.setAttribute('aria-posinset', i + 1);
      }
    }
  },

  _placeCardsInRow: function(rowElem, firstIndex, smoothly) {
    console.log('_placeCardsInRow: ', rowElem, firstIndex, smoothly);
    rowElem = rowElem || this.element;
    firstIndex = firstIndex || 0;
    var listNode = rowElem.firstElementChild;
    this._setContentWidth(listNode.childElementCount);

    var cardWidth = this.cardWidth;
    // add left margin to center the first card
    var startX = (this.windowWidth - this.cardWidth) / 2;
    var cardElements = Array.from(listNode.children).slice(firstIndex);

    cardElements.forEach(function(elm, idx) {
      var offset = (cardWidth + this.CARD_GUTTER);
      var left = startX + offset * (idx + firstIndex);
      elm.style.left = left + 'px';
      if (smoothly) {
        elm.style.transform = 'translateX(' +offset+ 'px)';
        setTimeout(function() {
          elm.classList.add('sliding');
          elm.style.transform = 'translateX(0)';
          eventSafety(elm, 'transitionend', function endSlide(e) {
            elm.classList.remove('sliding');
            elm.style.removeProperty('transform');
          }, 250);
        }, 0);
      }
    }, this);

    // this._setAccessibilityAttributes();
  },

  _placeCardsInColumn: function(column, firstIndex, smoothly) {
    console.log('_placeCardsInColumn: ', column, firstIndex, smoothly);
    firstIndex = firstIndex || 0;
    var listNode = column.firstElementChild;
    console.log('_placeCardsInColumn', column, firstIndex);
    this._setColumnHeight(column, listNode.childElementCount);

    var cardHeight = this.cardHeight;
    // add left margin to center the first card
    var startY = (this.windowHeight - this.cardHeight) / 2;
    var cardElements = Array.from(listNode.children).slice(firstIndex);

    cardElements.forEach(function(elm, idx) {
      var offset = (cardHeight + this.CARD_VERTICAL_SPACING);
      var top = startY + offset * (idx + firstIndex);
      var fromTop = (top - startY) * -1;
      elm.style.top = top + 'px'; // actual position
      elm.style.transform = 'translateY(' +fromTop+ 'px)'; // in default/collapsed state, transform to 0;
      console.log('_placeCardsInColumn, set top: ', elm.style.top, elm.dataset.appInstanceId);
      // if (smoothly) {
      //   elm.style.transform = 'translateY(' +offset+ 'px)';
      //   setTimeout(function() {
      //     elm.classList.add('sliding');
      //     elm.style.transform = 'translateY(0)';
      //     eventSafety(elm, 'transitionend', function endSlide(e) {
      //       elm.classList.remove('sliding');
      //       elm.style.removeProperty('transform');
      //     }, 250);
      //   }, 0);
      // }
    }, this);
    // this._setAccessibilityAttributes();
  },

  closeCard: function(elem) {
    console.log('closeCard for: ', elem);
    var listNode = elem.parentNode;
    var column = this.getContainingColumn(elem);
    var position = parseInt(elem.dataset.position);
    var lastIndex;
    elem.remove();

    if (listNode.childElementCount) {
      this._updateItemPositions(listNode); // pass the <ul>
      lastIndex = listNode.childElementCount -1;
      position = Math.min(position, lastIndex);
    } else {
      listNode = column.parentNode;
      lastIndex = listNode.childElementCount -1;
      position = Math.min(parseInt(column.dataset.position), lastIndex);
      console.log('closeCard, remove empty column', column, position);
      column.remove();
      this._updateItemPositions(listNode); // pass the <ul>
    }
    if (listNode === this.cardsList) {
      this._placeCardsInRow(null, position, true);
      // this._centerCardAtHorizontalPosition(position);
    } else {
      this._placeCardsInColumn(column, position, true);
      // this._centerCardAtColumnPosition(column, position);
    }
  }

};
cardGroups.init();
cardGroups.changeExpandedState(false);
