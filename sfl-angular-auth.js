'use strict';

angular.module('sfl.auth', [
    'ui.router',
    'sfl.session'
])

.run(function ($log, $rootScope, $state, sflAuth) {

    sflAuth.restore();

    $rootScope.$on('$stateChangeStart', function (event, toState, toParams, fromState, fromParams) {
        $log.debug('Routing', fromState.name, '->', toState.name);
        if (!toState.data || !toState.data.security) return;
        if (!sflAuth.isAuthenticated()) {
            event.preventDefault();
            $state.go(sflAuth.redirections.loginState, {
                redirect: toState.name
            })
        }
        if (!sflAuth.isAuthorized(toState.data.security.roles)) {
            event.preventDefault();
            $state.go(sflAuth.redirections.forbiddenState);
        };
    });

})

.config(function($httpProvider) {
    
//    $httpProvider.interceptors.push('sflAuthLoginRedirectInterceptor');    
    
})

.factory('sflAuthLoginRedirectInterceptor', function ($q, $injector) {
    return {
        responseError: function (rejection) {
            if (rejection.status === 401) {
                $injector.get('sflAuth').logout();
                $injector.get('$state').go($injector.get('sflAuth').redirections.loginState, { redirect: $injector.get('$state').current.name, forbidden: false });
            };
            if (rejection.status === 403) {
                $injector.get('$state').go($injector.get('sflAuth').redirections.forbiddenState, { redirect: $injector.get('$state').current.name });
            };
            return $q.reject(rejection);
        }
    };
})

.service('sflAuth', function ($log, sflSession, sflAuthLoopBack, $rootScope, $state, $filter) {

    var self = this;

    self.provider = sflAuthLoopBack;

    self.redirections = {
        loginState: 'login',
        forbiddenState: 'forbidden',
        afterLoginState: 'dashboard',
        afterLogoutState: 'home'
    };
    
    self.user = null;

    self.init = function () {

    };
    
    self.restore = function() {
        sflSession.restore();
        var auth = sflSession.get('auth');
        self.user = auth && auth.user ? auth.user : null;        
    };

    self.register = function (user, successCallback, errorCallback) {
        self.provider.register(user, successCallback, errorCallback);
    };
    
    self.reset = function(email, successCallback, errorCallback) {
        self.provider.reset(email, successCallback, errorCallback);
    };
    
    self.confirm = function(user, successCallback, errorCallback) {
        self.provider.confirm(user, successCallback, errorCallback);
    };

    self.login = function (credentials, nextState, successCallback, errorCallback) {

        $log.debug('Login requested');

        self.provider.login(credentials, function (data) {
            self.user = data;
            sflSession.set('auth', { user: data });
            sflSession.save();
            $rootScope.$emit('sfl:auth:user-changed', data);
            if (successCallback) successCallback(data);
            $state.go(nextState ? nextState : self.redirections.afterLoginState);
        }, function (error) {
            if (errorCallback) errorCallback(error);
        });

    };

    self.logout = function (successCallback, errorCallback) {

        $log.debug('Logout requested');

        self.provider.logout(function (data) {
            self.user = null;
            sflSession.set('auth', { user: null });
            sflSession.save();
            $rootScope.$emit('sfl:auth:user-changed');
            if (successCallback) successCallback(data);
            $state.go(self.redirections.afterLogoutState);
        }, function (error) {
            self.user = null;
            sflSession.set('auth', { user: null });
            sflSession.save();
            $rootScope.$emit('sfl:auth:user-changed');
            if (errorCallback) errorCallback(error);
            $state.go(self.redirections.afterLogoutState);
        });

    };

    self.isAuthenticated = function () {
        $log.debug('Authentication check');
        return self.provider.isAuthenticated() && self.user !== null;
    };

    self.isAuthorized = function (roles) {

        $log.debug('Authorization', roles, 'against', self.user.roles);

        var granted = false;

        if (self.isAuthenticated()) {

            if (roles && angular.isArray(roles) && roles.length > 0) {

                var userRoles = self.user.roles;

                for (var i = 0; i < roles.length; i++) {
                    $log.debug('Role check', roles[i]);
                    var r = $filter('filter')(userRoles, {
                        name: roles[i]
                    }, true);
                    $log.debug('Role check:', roles[i], 'result:', r);
                    granted = r.length > 0;
                    if (granted) break;
                };

            } else {
                granted = true;
            }

        };

        $log.debug('Access', granted ? 'granted' : 'denied');

        return granted;

    };

    self.init();

})

.directive('sflAuthAcl', function ($rootScope, sflAuth) {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            var display = element.css('display');
            var roles = attrs.sflAuthAcl.length > 0 ? attrs.sflAuthAcl.split(',') : [];
            element.css('display', !sflAuth.isAuthorized(roles) ? 'none' : display);
            $rootScope.$watch('app.user.roles', function () {
                element.css('display', !sflAuth.isAuthorized(roles) ? 'none' : display);
            });
        }
    };
});
