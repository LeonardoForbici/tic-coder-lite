package com.acme.pedido.repository;

import com.acme.pedido.model.Pedido;

public interface PedidoRepository extends JpaRepository<Pedido, Long> {

    @Query(value = "SELECT * FROM \"pedido_item\" pi WHERE pi.pedido_id = ?1", nativeQuery = true)
    Object[] itens(Long pedidoId);

    Long persistir(String body);
}
