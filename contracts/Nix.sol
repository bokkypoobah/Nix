pragma solidity ^0.8.0;

// ----------------------------------------------------------------------------
// Nix v0.9.0
//
// https://github.com/bokkypoobah/Nix
//
// Deployed to
//
// SPDX-License-Identifier: MIT
//
// Enjoy. And hello, from the past.
//
// (c) BokkyPooBah / Bok Consulting Pty Ltd 2021
// ----------------------------------------------------------------------------

interface IERC20Partial {
    function balanceOf(address tokenOwner) external view returns (uint balance);
    function allowance(address tokenOwner, address spender) external view returns (uint remaining);
    function transfer(address to, uint tokens) external returns (bool success);
    function transferFrom(address from, address to, uint tokens) external returns (bool success);
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721Partial is IERC165 {
    function ownerOf(uint tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint balance);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function safeTransferFrom(address _from, address _to, uint _tokenId) external payable;
}

interface IRoyaltyEngineV1Partial is IERC165 {
    function getRoyaltyView(address tokenAddress, uint tokenId, uint value) external view returns(address payable[] memory recipients, uint[] memory amounts);
}

interface ERC721TokenReceiver {
    function onERC721Received(address _operator, address _from, uint _tokenId, bytes memory _data) external returns(bytes4);
}


contract Owned {
    address public owner;
    address public newOwner;

    event OwnershipTransferred(address indexed _from, address indexed _to);
    event Withdrawn(address indexed token, uint tokens, uint tokenId);

    modifier onlyOwner {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address _newOwner) public onlyOwner {
        newOwner = _newOwner;
    }
    function acceptOwnership() public {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
        newOwner = address(0);
    }

    function withdraw(address token, uint tokens, uint tokenId) public onlyOwner {
        if (tokenId == 0) {
            if (token == address(0)) {
                payable(owner).transfer((tokens == 0 ? address(this).balance : tokens));
            } else {
                IERC20Partial(token).transfer(owner, tokens == 0 ? IERC20Partial(token).balanceOf(address(this)) : tokens);
            }
        } else {
            IERC721Partial(token).safeTransferFrom(address(this), owner, tokenId);
        }
        emit Withdrawn(address(token), tokens, tokenId);
    }
}


contract ReentrancyGuard {
    uint private _executing;
    modifier reentrancyGuard() {
        require(_executing != 1, "NO!");
        _executing = 1;
        _;
        _executing = 2;
    }
}


/// @author BokkyPooBah, Bok Consulting Pty Ltd
/// @title Decentralised ERC-721 exchange
contract Nix is Owned, ReentrancyGuard, ERC721TokenReceiver {

    enum BuyOrSell { Buy, Sell }
    enum AnyOrAll { Any, All }

    struct TokenInfo {
        address token;
        bytes32[] ordersIndex;
        mapping(bytes32 => Order) orders;
        uint64 executed;
        uint64 volumeToken;
        uint volumeWeth;
    }
    struct Order {
        address maker;
        address taker;
        uint[] tokenIds;
        uint price;
        BuyOrSell buyOrSell;
        AnyOrAll anyOrAll;
        uint64 expiry;
        uint64 tradeCount;
        uint64 tradeMax;
        uint64 royaltyFactor;
    }
    struct Netting {
        address accounts;
        int amount;
    }
    struct OrderInfo {
        address token;
        uint64 orderIndex;
    }
    struct Trade {
        address taker;
        uint64 royaltyFactor;
        uint64 blockNumber;
        address[] uniqueAddresses;
        mapping(address => bool) seen;
        mapping(address => int) netting;
        OrderInfo[] orders;
    }

    bytes4 private constant ERC721_INTERFACE = 0x80ac58cd; // https://eips.ethereum.org/EIPS/eip-721
    bytes4 private constant ERC721METADATA_INTERFACE = 0x5b5e139f;
    bytes4 private constant ERC721ENUMERABLE_INTERFACE = 0x780e9d63;

    IERC20Partial public weth;
    IRoyaltyEngineV1Partial public royaltyEngine;

    address[] private tokenInfosIndex;
    mapping(address => TokenInfo) public tokenInfos;
    Trade[] private trades;

    event TokenInfoAdded(address token, uint tokenInfoIndex);
    event MakerOrderAdded(address token, uint orderIndex);
    event MakerOrderDisabled(address token, uint orderIndex);
    event MakerOrderTokenIdsUpdated(address token, uint orderIndex);
    event MakerOrderUpdated(address token, uint orderIndex);
    event TakerOrderExecuted(address token, uint orderIndex);
    event ThankYou(uint tip);

    constructor(IERC20Partial _weth, IRoyaltyEngineV1Partial _royaltyEngine) {
        weth = _weth;
        royaltyEngine = _royaltyEngine;
    }

    function onERC721Received(address /*_operator*/, address /*_from*/, uint _tokenId, bytes memory /*_data*/) external override returns(bytes4) {
        emit ThankYou(_tokenId);
        return this.onERC721Received.selector;
    }

    function tokenInfosLength() public view returns (uint) {
        return tokenInfosIndex.length;
    }
    function ordersLength(address token) public view returns (uint) {
        return tokenInfos[token].ordersIndex.length;
    }
    function tradesLength() public view returns (uint) {
        return trades.length;
    }
    function getTokenInfo(uint tokenInfoIndex) external view returns (address token, uint64 _ordersLength, uint64 executed, uint64 volumeToken, uint volumeWeth) {
        token = tokenInfosIndex[tokenInfoIndex];
        TokenInfo storage tokenInfo = tokenInfos[token];
        _ordersLength = uint64(tokenInfo.ordersIndex.length);
        executed = tokenInfo.executed;
        volumeToken = tokenInfo.volumeToken;
        volumeWeth = tokenInfo.volumeWeth;
    }
    function getOrder(address token, uint orderIndex) external view returns (Order memory order) {
        bytes32 orderKey = tokenInfos[token].ordersIndex[orderIndex];
        order = tokenInfos[token].orders[orderKey];
    }
    function getTrade(uint tradeIndex) external view returns (address taker, uint64 royaltyFactor, uint64 blockNumber, OrderInfo[] memory orders) {
        Trade storage trade = trades[tradeIndex];
        return (trade.taker, trade.royaltyFactor, trade.blockNumber, trade.orders);
    }

    /// @dev Maker add order
    /// @param token ERC-721 contract address
    /// @param tokenIds [] (empty) for any, [tokenId1, tokenId2, ...] for specific tokenIds. Must not be empty for All
    /// @param taker Specific address, or null for any taker
    /// @param price Price per NFT for Any. Price for all specified NFTs for All
    /// @param buyOrSell (0) Buy, (1) Sell
    /// @param anyOrAll (0) Any, (1) All
    /// @param expiry Expiry date. 0 = no expiry.
    /// @param tradeMax Must be 0 or 1 for All. Maximum number of NFTs for Any
    /// @param royaltyFactor 0 to 100, and will be applied as % when the maker sells the NFTs
    /// @param integrator Address of integrator, that will receive a portion of ETH tips
    /// @return orderIndex The new order index
    function makerAddOrder(
        address token,
        uint[] memory tokenIds,
        address taker,
        uint price,
        BuyOrSell buyOrSell,
        AnyOrAll anyOrAll,
        uint64 expiry,
        uint64 tradeMax,
        uint64 royaltyFactor,
        address integrator
    ) external payable reentrancyGuard returns (
        uint64 orderIndex
    ) {
        if (anyOrAll == AnyOrAll.All) {
            require(tokenIds.length > 0, "TokenIds");
            require(tradeMax <= 1, "Parcel");
        } else {
            require(tradeMax > 0, "Must have at least one trade");
        }
        require(royaltyFactor <= 100, "Royalty");

        TokenInfo storage tokenInfo = tokenInfos[token];
        if (tokenInfo.token != token) {
            try IERC721Partial(token).supportsInterface(ERC721_INTERFACE) returns (bool b) {
                require(b, "ERC721");
                tokenInfosIndex.push(token);
                tokenInfo.token = token;
                emit TokenInfoAdded(token, tokenInfosIndex.length - 1);
            } catch {
                revert("Not ERC721");
            }
        }

        bytes32 _orderKey = keccak256(abi.encodePacked(msg.sender, taker, token, tokenIds, buyOrSell, anyOrAll, expiry));
        require(tokenInfo.orders[_orderKey].maker == address(0), "Duplicate");

        tokenInfo.ordersIndex.push(_orderKey);
        Order storage order = tokenInfo.orders[_orderKey];
        order.maker = msg.sender;
        order.taker = taker;
        order.tokenIds = tokenIds;
        order.price = price;
        order.buyOrSell = buyOrSell;
        order.anyOrAll = anyOrAll;
        order.expiry = expiry;
        order.tradeMax = tradeMax;
        order.royaltyFactor = royaltyFactor;
        emit MakerOrderAdded(token, tokenInfo.ordersIndex.length - 1);
        handleTips(integrator);
        return uint64(tokenInfo.ordersIndex.length - 1);
    }

    // Code too large
    // /// @dev Maker disable order
    // /// @param token ERC-721 contract address
    // /// @param orderIndex Order index
    // /// @param integrator Address of integrator, that will receive a portion of ETH tips
    // function makerDisableOrder(address token, uint orderIndex, address integrator) external payable reentrancyGuard {
    //     bytes32 orderKey = tokenInfos[token].ordersIndex[orderIndex];
    //     Order storage order = tokenInfos[token].orders[orderKey];
    //     require(msg.sender == order.maker, "Not maker");
    //     order.expiry = uint64(block.timestamp - 1);
    //     emit MakerOrderDisabled(token, orderIndex);
    //     handleTips(integrator);
    // }

    // /// @dev Maker update order tokenIds
    // /// @param token ERC-721 contract address
    // /// @param orderIndex Order index
    // /// @param tokenIds [] (empty) for any, [tokenId1, tokenId2, ...] for specific tokenIds. Must not be empty for All
    // /// @param integrator Address of integrator, that will receive a portion of ETH tips
    // function makerUpdateOrderTokenIds(
    //     address token,
    //     uint orderIndex,
    //     uint[] memory tokenIds,
    //     address integrator
    // ) external payable reentrancyGuard {
    //     bytes32 orderKey = tokenInfos[token].ordersIndex[orderIndex];
    //     Order storage order = tokenInfos[token].orders[orderKey];
    //     require(msg.sender == order.maker, "Not maker");
    //     order.tokenIds = tokenIds;
    //     emit MakerOrderTokenIdsUpdated(token, orderIndex);
    //     handleTips(integrator);
    // }

    /// @dev Maker update order
    /// @param token ERC-721 contract address
    /// @param orderIndex Order index
    /// @param taker Specific address, or null for any taker
    /// @param price Price per NFT for Any. Price for all specified NFTs for All
    /// @param expiry Expiry date. 0 = no expiry.
    /// @param tradeMaxAdjustment Positive or negative number to adjust tradeMax. tradeMax must result in 0 or 1 for All, or the maximum number of NFTs for Any
    /// @param royaltyFactor 0 to 100, and will be applied as % when the maker sells the NFTs
    /// @param integrator Address of integrator, that will receive a portion of ETH tips
    function makerUpdateOrder(
        address token,
        uint orderIndex,
        address taker,
        uint price,
        uint64 expiry,
        int64 tradeMaxAdjustment,
        uint64 royaltyFactor,
        address integrator
    ) external payable reentrancyGuard {
        bytes32 orderKey = tokenInfos[token].ordersIndex[orderIndex];
        Order storage order = tokenInfos[token].orders[orderKey];
        require(msg.sender == order.maker, "Not maker");
        order.taker = taker;
        order.price = price;
        order.expiry = expiry;
        if (tradeMaxAdjustment < 0) {
            uint64 subtract = uint64(-tradeMaxAdjustment);
            if (subtract > (order.tradeMax - order.tradeCount)) {
                order.tradeMax -= subtract;
            } else {
                order.tradeMax = order.tradeCount;
            }
        } else {
            order.tradeMax += uint64(tradeMaxAdjustment);
        }
        if (order.anyOrAll == AnyOrAll.All) {
            require(order.tradeMax <= 1, "Parcel");
        }
        order.royaltyFactor = royaltyFactor;
        emit MakerOrderUpdated(token, orderIndex);
        handleTips(integrator);
    }

    /// @dev Taker execute orders.
    /// @param tokenList List of ERC-721 contract addresses - one address for each order
    /// @param orderIndexes List of order indices - one orderIndex for each order
    /// @param tokenIdsList List of list of tokenIds - one set of tokenIds for each order
    /// @param netAmount Positive (taker receives WETH) or negative (taker pays WETH) for all orders
    /// @param royaltyFactor 0 to 100, and will be applied as % when the taker sells the NFTs
    /// @param integrator Address of integrator, that will receive a portion of ETH tips
    function takerExecuteOrders(
        address[] memory tokenList,
        uint[] memory orderIndexes,
        uint[][] memory tokenIdsList,
        int netAmount,
        uint64 royaltyFactor,
        address integrator
    ) external payable reentrancyGuard {
        require(tokenList.length > 0);
        require(tokenList.length == orderIndexes.length);
        require(tokenList.length == tokenIdsList.length);
        require(royaltyFactor <= 100, "Royalty");

        trades.push();
        Trade storage trade = trades[trades.length - 1];
        trade.taker = msg.sender;
        trade.royaltyFactor = royaltyFactor;
        trade.blockNumber = uint64(block.number);

        for (uint i = 0; i < orderIndexes.length; i++) {
            // address token = tokenList[i];
            TokenInfo storage tokenInfo = tokenInfos[tokenList[i]];
            tokenInfo.executed++;
            bytes32 orderKey = tokenInfo.ordersIndex[orderIndexes[i]];
            Order storage order = tokenInfo.orders[orderKey];
            trade.orders.push(OrderInfo(tokenList[i], uint64(orderIndexes[i])));
            uint[] memory tokenIds = tokenIdsList[i];
            require(tokenIds.length > 0, "TokenIds");
            require(order.taker == address(0) || order.taker == msg.sender, "Not taker");
            require(order.expiry == 0 || order.expiry >= block.timestamp, "Expired");
            require(order.tradeCount < order.tradeMax, "Maxxed");

            address nftFrom;
            address nftTo;
            if (order.buyOrSell == BuyOrSell.Buy) {
                (nftFrom, nftTo) = (msg.sender, order.maker);
            } else {
                (nftFrom, nftTo) = (order.maker, msg.sender);
            }

            if (order.anyOrAll == AnyOrAll.Any) {
                for (uint j = 0; j < tokenIds.length; j++) {
                    bool found = false;
                    if (order.tokenIds.length == 0) {
                        found = true;
                    } else {
                        for (uint k = 0; k < order.tokenIds.length && !found; k++) {
                            if (tokenIds[j] == order.tokenIds[k]) {
                                found = true;
                            }
                        }
                    }
                    require(found, "TokenId");
                    IERC721Partial(tokenInfo.token).safeTransferFrom(nftFrom, nftTo, tokenIds[j]);
                    tokenInfo.volumeToken++;
                    tokenInfo.volumeWeth += order.price;
                    addNetting(tokenInfo, tokenIds[j], trade, nftTo, nftFrom, order);
                }
            } else {
                require(tokenIds.length == order.tokenIds.length, "TokenIds length");
                for (uint j = 0; j < order.tokenIds.length; j++) {
                    require(tokenIds[j] == order.tokenIds[j], "TokenIds");
                    IERC721Partial(tokenInfo.token).safeTransferFrom(nftFrom, nftTo, order.tokenIds[j]);
                    tokenInfo.volumeToken++;
                }
                tokenInfo.volumeWeth += order.price;
                // NOTE - Royalty information for the FIRST tokenId for All
                addNetting(tokenInfo, order.tokenIds[0], trade, nftTo, nftFrom, order);
            }
            order.tradeCount++;
            emit TakerOrderExecuted(tokenInfo.token, orderIndexes[i]);
        }
        require(trade.netting[msg.sender] == netAmount, "NetAmount");
        transferNetted(trade);
        handleTips(integrator);
    }

    function addNetting(TokenInfo storage tokenInfo, uint tokenId, Trade storage trade, address wethFrom, address wethTo, Order memory order) private {
        if (!trade.seen[wethFrom]) {
            trade.uniqueAddresses.push(wethFrom);
            trade.seen[wethFrom] = true;
        }
        if (!trade.seen[wethTo]) {
            trade.uniqueAddresses.push(wethTo);
            trade.seen[wethTo] = true;
        }
        trade.netting[wethFrom] -= int(order.price);

        (address payable[] memory recipients, uint256[] memory amounts) = royaltyEngine.getRoyaltyView(tokenInfo.token, tokenId, order.price);
        require(recipients.length == amounts.length);
        uint royaltyFactor = order.buyOrSell == BuyOrSell.Sell ? order.royaltyFactor : trade.royaltyFactor;
        for (uint i = 0; i < recipients.length; i++) {
            if (!trade.seen[recipients[i]]) {
                trade.uniqueAddresses.push(recipients[i]);
                trade.seen[recipients[i]] = true;
            }
            uint royalty = amounts[i] * royaltyFactor / 100;
            trade.netting[recipients[i]] += int(royalty);
            trade.netting[wethTo] -= int(royalty);
        }
        trade.netting[wethTo] += int(order.price);
    }
    function transferNetted(Trade storage trade) private {
        for (uint i = 0; i < trade.uniqueAddresses.length; i++) {
            address account = trade.uniqueAddresses[i];
            delete trade.seen[account];
            if (trade.netting[account] < 0) {
                require(weth.transferFrom(account, address(this), uint(-trade.netting[account])), "-Weth tx");
            }
        }
        for (uint i = 0; i < trade.uniqueAddresses.length; i++) {
            address account = trade.uniqueAddresses[i];
            if (trade.netting[account] > 0) {
                require(weth.transfer(account, uint(trade.netting[account])), "+Weth tx");
            }
            delete trade.netting[account];
        }
        delete trade.uniqueAddresses;
    }
    function handleTips(address integrator) private {
        if (msg.value > 0) {
            uint integratorTip;
            if (integrator != address(0) && integrator != owner) {
                integratorTip = msg.value * 3 / 4;
                if (integratorTip > 0) {
                    payable(integrator).transfer(integratorTip);
                }
            }
            emit ThankYou(msg.value);
        }
    }
    receive() external payable {
        handleTips(owner);
    }
}


/// @author BokkyPooBah, Bok Consulting Pty Ltd
/// @title Decentralised ERC-721 exchange bulk data retrieval helper
contract NixHelper {

    enum OrderStatus {
        Executable,
        Expired,
        Maxxed,
        MakerNoWeth,
        MakerNoWethAllowance,
        MakerNoToken,
        MakerNotApprovedNix,
        UnknownError
    }

    Nix public nix;
    IERC20Partial immutable public weth;

    constructor(Nix _nix) {
        nix = _nix;
        weth = _nix.weth();
    }

    function getTokenInfos(
        uint[] memory tokenInfosIndices
    ) public view returns (
        address[] memory tokens,
        uint64[] memory ordersLengthList,
        uint64[] memory executedList,
        uint64[] memory volumeTokenList,
        uint[] memory volumeWethList
    ) {
        uint length = tokenInfosIndices.length;
        tokens = new address[](length);
        ordersLengthList = new uint64[](length);
        executedList = new uint64[](length);
        volumeTokenList = new uint64[](length);
        volumeWethList = new uint[](length);
        for (uint i = 0; i < length; i++) {
            uint tokenInfoIndex = tokenInfosIndices[i];
            if (tokenInfoIndex < nix.tokenInfosLength()) {
                (address token, uint64 ordersLength, uint64 executed, uint64 volumeToken, uint volumeWeth) = nix.getTokenInfo(tokenInfoIndex);
                tokens[i] = token;
                ordersLengthList[i] = ordersLength;
                executedList[i] = executed;
                volumeTokenList[i] = volumeToken;
                volumeWethList[i] = volumeWeth;
            }
        }
    }


    function orderStatus(address token, Nix.Order memory order) public view returns (OrderStatus) {
        if (order.expiry > 0 && order.expiry < block.timestamp) {
            return OrderStatus.Expired;
        }
        if (order.tradeCount >= order.tradeMax) {
            return OrderStatus.Maxxed;
        }
        if (order.buyOrSell == Nix.BuyOrSell.Buy) {
            uint wethBalance = weth.balanceOf(order.maker);
            if (wethBalance < order.price) {
                return OrderStatus.MakerNoWeth;
            }
            uint wethAllowance = weth.allowance(order.maker, address(nix));
            if (wethAllowance < order.price) {
                return OrderStatus.MakerNoWethAllowance;
            }
        } else {
            try IERC721Partial(token).isApprovedForAll(order.maker, address(nix)) returns (bool b) {
                if (!b) {
                    return OrderStatus.MakerNotApprovedNix;
                }
            } catch {
                return OrderStatus.UnknownError;
            }
            if (order.anyOrAll == Nix.AnyOrAll.Any) {
                if (order.tokenIds.length == 0) {
                    try IERC721Partial(token).balanceOf(order.maker) returns (uint b) {
                        if (b == 0) {
                            return OrderStatus.MakerNoToken;
                        }
                    } catch {
                        return OrderStatus.UnknownError;
                    }
                } else {
                    bool found = false;
                    for (uint j = 0; j < order.tokenIds.length && !found; j++) {
                        try IERC721Partial(token).ownerOf(order.tokenIds[j]) returns (address a) {
                            if (a == order.maker) {
                                found = true;
                            }
                        } catch {
                            return OrderStatus.UnknownError;
                        }
                    }
                    if (!found) {
                        return OrderStatus.MakerNoToken;
                    }
                }
            } else {
                for (uint j = 0; j < order.tokenIds.length; j++) {
                    try IERC721Partial(token).ownerOf(order.tokenIds[j]) returns (address a) {
                        if (a != order.maker) {
                            return OrderStatus.MakerNoToken;
                        }
                    } catch {
                        return OrderStatus.UnknownError;
                    }
                }
            }
        }
        return OrderStatus.Executable;
    }

    function getOrders(
        address token,
        uint[] memory orderIndices
    ) public view returns (
        address[] memory makers,
        address[] memory takers,
        uint[][] memory tokenIds,
        uint[] memory prices,
        uint64[7][] memory data
    ) {
        uint length = orderIndices.length;
        makers = new address[](length);
        takers = new address[](length);
        tokenIds = new uint[][](length);
        prices = new uint[](length);
        data = new uint64[7][](length);
        uint ordersLength = nix.ordersLength(token);
        for (uint i = 0; i < length; i++) {
            uint orderIndex = orderIndices[i];
            if (orderIndex < ordersLength) {
                Nix.Order memory order = nix.getOrder(token, orderIndex);
                makers[i] = order.maker;
                takers[i] = order.taker;
                tokenIds[i] = order.tokenIds;
                prices[i] = order.price;
                data[i][0] = uint64(order.buyOrSell);
                data[i][1] = uint64(order.anyOrAll);
                data[i][2] = uint64(order.expiry);
                data[i][3] = uint64(order.tradeCount);
                data[i][4] = uint64(order.tradeMax);
                data[i][5] = uint64(order.royaltyFactor);
                data[i][6] = uint64(orderStatus(token, order));
            }
        }
    }

    function getTrades(
        uint[] memory tradeIndexes
    ) public view returns (
        address[] memory takers,
        uint64[] memory royaltyFactors,
        uint64[] memory blockNumbers,
        Nix.OrderInfo[][] memory ordersList
    ) {
        uint length = tradeIndexes.length;
        takers = new address[](length);
        royaltyFactors = new uint64[](length);
        blockNumbers = new uint64[](length);
        ordersList = new Nix.OrderInfo[][](length);
        uint tradesLength = nix.tradesLength();
        for (uint i = 0; i < length; i++) {
            uint tradeIndex = tradeIndexes[i];
            if (tradeIndex < tradesLength) {
                (address taker, uint64 royaltyFactor, uint64 blockNumber, Nix.OrderInfo[] memory orders) = nix.getTrade(tradeIndex);
                takers[i] = taker;
                royaltyFactors[i] = royaltyFactor;
                blockNumbers[i] = blockNumber;
                ordersList[i] = orders;
            }
        }
    }
}
